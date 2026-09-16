import { createHash } from 'node:crypto';
import { and, eq, gte, ne, sql } from 'drizzle-orm';
import { db } from '../db';
import { appointments } from '../db/schema/appointments';
import { medicalRecords, medicalRecordAttachments } from '../db/schema/medical';
import { patients } from '../db/schema/patients';
import { invoices, invoiceItems, payments } from '../db/schema/billing';
import { products, stockLocations, stockByLocation, stockMovements } from '../db/schema/inventory';
import { visitOperations } from '../db/schema/visit-operations';
import { VisitError, validateVisitChange } from './visit-operation';
import { canAccessVisit, type VisitUser } from './visits';
import { toCents, fromCents } from './money';
import type { VisitOperation, VisitResult } from './visit-types';

export async function saveVisit(user: VisitUser, operation: VisitOperation): Promise<VisitResult> {
  const hash = createHash('sha256').update(JSON.stringify(operation)).digest('hex');
  return db.transaction(async (tx) => {
    // Same key across concurrent retries is serialized before checking the receipt.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${user.id + ':' + operation.id}, 0))`);
    const [visit] = await tx.select().from(appointments).where(eq(appointments.id, operation.visitId)).for('update');
    if (!visit || !canAccessVisit(user, visit.veterinarianId)) throw new VisitError(404, 'Visita no encontrada');
    const [receipt] = await tx.select().from(visitOperations).where(and(eq(visitOperations.userId, user.id), eq(visitOperations.operationId, operation.id)));
    if (receipt) {
      if (receipt.payloadHash !== hash) throw new VisitError(409, 'El identificador de guardado ya se utilizó con otros datos.');
      return receipt.result;
    }
    if (operation.record && !['admin', 'veterinario'].includes(user.role)) throw new VisitError(403, 'Solo un veterinario puede registrar una consulta.');
    if (operation.action === 'complete' && user.role === 'recepcionista') throw new VisitError(403, 'El veterinario debe cerrar la atención.');
    const [existingRecord] = await tx.select({ id: medicalRecords.id }).from(medicalRecords).where(eq(medicalRecords.appointmentId, visit.id)).limit(1);
    const linkedInvoices = await tx.select().from(invoices).where(and(eq(invoices.appointmentId, visit.id), ne(invoices.status, 'anulada'))).for('update');
    if (linkedInvoices.length > 1 && (operation.charge || operation.payment)) throw new VisitError(409, 'Hay más de un cobro asociado. Revisa los cobros antes de registrar el pago.');
    let invoice = linkedInvoices[0];
    let expectedUpdatedAt = operation.expectedUpdatedAt;
    if (operation.predecessorId) {
      const [previous] = await tx.select().from(visitOperations).where(and(eq(visitOperations.userId, user.id), eq(visitOperations.operationId, operation.predecessorId)));
      if (!previous || previous.result.visitId !== visit.id) throw new VisitError(409, 'Falta sincronizar la operación anterior de esta visita.');
      expectedUpdatedAt = previous.result.updatedAt;
    }
    validateVisitChange({ ...operation, expectedUpdatedAt }, visit, Boolean(existingRecord), Boolean(invoice));
    let recordId: number | null = existingRecord?.id ?? null;
    if (operation.record) {
      const { supplies, photos, ...record } = operation.record;
      const [saved] = await tx.insert(medicalRecords).values({ ...record, patientId: visit.patientId, veterinarianId: user.id, appointmentId: visit.id, date: new Date() }).returning();
      recordId = saved.id;
      if (photos?.length) await tx.insert(medicalRecordAttachments).values(photos.map((photo) => ({ medicalRecordId: saved.id, photo })));
      if (record.vitalSigns?.weight) await tx.update(patients).set({ weight: String(record.vitalSigns.weight) }).where(eq(patients.id, visit.patientId));
      // Stable lock order avoids deadlocks between visits using multiple supplies.
      for (const supply of [...(supplies ?? [])].sort((a, b) => a.productId - b.productId || (a.locationId ?? 0) - (b.locationId ?? 0))) {
        if (supply.locationId) {
          const [location] = await tx.select().from(stockLocations).where(eq(stockLocations.id, supply.locationId));
          if (!location || !location.isActive || (user.role === 'veterinario' && location.assignedVetId !== user.id)) throw new VisitError(403, 'El botiquín seleccionado no está disponible para este veterinario.');
        }
        const [product] = await tx.update(products).set({ stock: sql`${products.stock} - ${supply.quantity}` })
          .where(and(eq(products.id, supply.productId), eq(products.isActive, true), gte(products.stock, String(supply.quantity)),
            supply.locationId ? undefined : sql`${products.stock} - ${supply.quantity} >= (SELECT COALESCE(SUM(s.stock), 0) FROM stock_by_location s WHERE s.product_id = ${products.id})`,
          ))
          .returning({ id: products.id, name: products.name });
        if (!product) throw new VisitError(409, `Stock insuficiente del insumo ${supply.productId}. La consulta permanece pendiente.`);
        if (supply.locationId) {
          const [row] = await tx.update(stockByLocation).set({ stock: sql`${stockByLocation.stock} - ${supply.quantity}` })
            .where(and(eq(stockByLocation.productId, supply.productId), eq(stockByLocation.locationId, supply.locationId), gte(stockByLocation.stock, String(supply.quantity)))).returning();
          if (!row) throw new VisitError(409, `Stock insuficiente de ${product.name} en el botiquín. La consulta permanece pendiente.`);
        }
        await tx.insert(stockMovements).values({ productId: supply.productId, quantity: String(supply.quantity), type: 'consumo_interno', reason: record.reason, referenceType: 'medical_record', referenceId: saved.id, locationId: supply.locationId ?? null, userId: user.id });
      }
    }
    if (operation.charge) {
      const amount = fromCents(toCents(operation.charge.amount));
      [invoice] = await tx.insert(invoices).values({
        invoiceNumber: `VIS-${operation.id.replaceAll('-', '').slice(0, 16)}`, ownerId: visit.ownerId, appointmentId: visit.id,
        date: new Date(), subtotal: amount, total: amount, status: 'emitida', createdBy: user.id,
      }).returning();
      await tx.insert(invoiceItems).values({ invoiceId: invoice.id, description: operation.charge.description, quantity: 1, unitPrice: amount, subtotal: amount });
    }
    if (operation.payment) {
      if (!invoice || invoice.status === 'pagada') throw new VisitError(409, 'No hay un cobro pendiente para registrar este pago.');
      const previous = await tx.select().from(payments).where(eq(payments.invoiceId, invoice.id));
      const paid = previous.reduce((total, p) => total + toCents(p.amount), 0);
      const amount = toCents(operation.payment.amount);
      const total = toCents(invoice.total);
      if (amount <= 0 || amount > total - paid) throw new VisitError(409, `El pago supera el saldo actual ($${fromCents(total - paid)}). Revisa el cobro.`);
      await tx.insert(payments).values({ invoiceId: invoice.id, amount: fromCents(amount), method: operation.payment.method, reference: operation.payment.reference || null, date: new Date(), receivedBy: user.id });
      await tx.update(invoices).set({ status: paid + amount === total ? 'pagada' : 'parcial' }).where(eq(invoices.id, invoice.id));
    }
    const status = operation.action === 'travel' ? 'en_camino' : operation.action === 'start' ? 'en_curso' : operation.action === 'complete' ? 'completada' : visit.status;
    const updatedAt = new Date();
    await tx.update(appointments).set({
      status, updatedAt,
      ...(operation.noCharge !== undefined ? { noCharge: operation.noCharge && !invoice } : {}),
      ...(operation.action === 'start' && !visit.startedAt ? { startedAt: new Date() } : {}),
      ...(operation.action === 'complete' && !visit.completedAt ? { completedAt: new Date() } : {}),
    }).where(eq(appointments.id, visit.id));
    const result: VisitResult = { visitId: visit.id, recordId, invoiceId: invoice?.id ?? null, status, updatedAt: updatedAt.toISOString() };
    await tx.insert(visitOperations).values({ userId: user.id, operationId: operation.id, payloadHash: hash, result });
    return result;
  });
}
