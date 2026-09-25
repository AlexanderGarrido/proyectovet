import { createHash } from 'node:crypto';
import { and, eq, gte, ne, sql } from 'drizzle-orm';
import { db } from '../db';
import { appointments } from '../db/schema/appointments';
import { medicalRecords, medicalRecordAttachments } from '../db/schema/medical';
import { patients } from '../db/schema/patients';
import { invoices, invoiceItems, payments } from '../db/schema/billing';
import { products, stockLocations, stockByLocation, stockMovements } from '../db/schema/inventory';
import { visitOperations } from '../db/schema/visit-operations';
import { services, visitServiceItems } from '../db/schema/services';
import { VisitError, validateVisitChange } from './visit-operation';
import { canAccessVisit, type VisitUser } from './visits';
import { resolveServices, totalCents, type ResolvedService } from './services';
import { toCents, fromCents } from './money';
import { createVisitFollowups } from './followups';
import type { VisitOperation, VisitResult } from './visit-types';

type Supply = { productId: number; quantity: number; locationId?: number | null };

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
    if (linkedInvoices.length > 1 && (operation.charge || operation.items || operation.payment)) throw new VisitError(409, 'Hay más de un cobro asociado. Revisa los cobros antes de registrar el pago.');
    let invoice = linkedInvoices[0];
    let expectedUpdatedAt = operation.expectedUpdatedAt;
    if (operation.predecessorId) {
      const [previous] = await tx.select().from(visitOperations).where(and(eq(visitOperations.userId, user.id), eq(visitOperations.operationId, operation.predecessorId)));
      if (!previous || previous.result.visitId !== visit.id) throw new VisitError(409, 'Falta sincronizar la operación anterior de esta visita.');
      expectedUpdatedAt = previous.result.updatedAt;
    }
    validateVisitChange({ ...operation, expectedUpdatedAt }, visit, Boolean(existingRecord), Boolean(invoice));
    // Antes esto se degradaba en silencio a `false`: la visita quedaba con
    // cobro y el profesional creía haberla marcado sin costo. Se rechaza
    // antes de tocar nada, para que el motivo quede dicho.
    if (operation.noCharge && invoice) {
      throw new VisitError(409, 'Esta visita ya tiene un cobro emitido, así que no puede marcarse sin costo. Anula el cobro desde facturación si corresponde.');
    }

    // Las prestaciones se resuelven contra el catálogo antes de tocar nada:
    // si una salió del catálogo o cambió de precio, conviene fallar aquí y
    // no a mitad del descuento de stock.
    const resolved: ResolvedService[] = operation.items ? await resolveServices(tx, operation.items) : [];
    if (resolved.length && invoice) throw new VisitError(409, 'La visita ya tiene un cobro. Registra el pago sobre ese saldo.');

    let recordId: number | null = existingRecord?.id ?? null;
    if (operation.record) {
      const { supplies, photos, templateId, templateVersion, amendsRecordId, ...record } = operation.record;
      // Una adenda tiene que apuntar a un registro de ESTA visita; si no,
      // podría enlazarse a la ficha de otro paciente y el historial diría
      // que alguien corrigió algo que nunca escribió.
      if (amendsRecordId) {
        const [target] = await tx.select({ id: medicalRecords.id }).from(medicalRecords)
          .where(and(eq(medicalRecords.id, amendsRecordId), eq(medicalRecords.appointmentId, visit.id)));
        if (!target) throw new VisitError(409, 'La nota que intentas corregir no pertenece a esta visita.');
      }
      const [saved] = await tx.insert(medicalRecords).values({
        ...record, patientId: visit.patientId, veterinarianId: user.id, appointmentId: visit.id, date: new Date(),
        templateId: templateId ?? null, templateVersion: templateVersion ?? null,
        // Una adenda declara explícitamente a quién corrige. Si no lo
        // declara pero la visita ya tenía nota, se enlaza a la primera:
        // dos registros sueltos sobre la misma atención no se pueden
        // ordenar después.
        amendsRecordId: amendsRecordId ?? existingRecord?.id ?? null,
      }).returning();
      recordId = saved.id;
      if (photos?.length) await tx.insert(medicalRecordAttachments).values(photos.map((photo) => ({ medicalRecordId: saved.id, photo })));
      if (record.vitalSigns?.weight) await tx.update(patients).set({ weight: String(record.vitalSigns.weight) }).where(eq(patients.id, visit.patientId));
      // Insumos declarados a mano y los que aporta cada prestación se
      // descuentan en una sola pasada: dos recorridos separados sobre los
      // mismos productos podrían bloquear filas en orden distinto y
      // provocar un interbloqueo entre visitas simultáneas.
      // Solo se busca el botiquín cuando hace falta decidir de dónde sale
      // un insumo de la prestación y nadie lo declaró; en el caso habitual
      // no se agrega ninguna consulta a la transacción.
      const declaredLocation = (supplies ?? []).find((s) => s.locationId)?.locationId ?? null;
      const needsDefault = !declaredLocation && resolved.some((item) => item.supplies.length);
      const defaultLocationId = declaredLocation ?? (needsDefault ? await soleAssignedLocation(tx, user) : null);
      await consumeSupplies(tx, user, mergeSupplies(supplies ?? [], resolved, defaultLocationId), record.reason, saved.id);
    } else if (resolved.some((item) => item.supplies.length)) {
      // Sin nota clínica no hay registro al que referir el consumo; se
      // exige guardar la consulta para que el movimiento quede trazable.
      throw new VisitError(400, 'Registra la consulta antes de guardar prestaciones que descuentan insumos.');
    }

    if (resolved.length) {
      const total = fromCents(totalCents(resolved));
      [invoice] = await tx.insert(invoices).values({
        invoiceNumber: `VIS-${operation.id.replaceAll('-', '').slice(0, 16)}`, ownerId: visit.ownerId, appointmentId: visit.id,
        date: new Date(), subtotal: total, total, status: 'emitida', createdBy: user.id,
      }).returning();
      for (const item of resolved) {
        const [line] = await tx.insert(invoiceItems).values({
          invoiceId: invoice.id, description: item.name, quantity: item.quantity,
          unitPrice: fromCents(item.unitPriceCents), subtotal: fromCents(item.subtotalCents),
        }).returning();
        await tx.insert(visitServiceItems).values({
          appointmentId: visit.id, serviceId: item.serviceId, medicalRecordId: recordId,
          invoiceId: invoice.id, invoiceItemId: line.id, quantity: String(item.quantity),
          descriptionSnapshot: item.name, unitPriceSnapshot: fromCents(item.unitPriceCents),
          operationId: operation.id, createdBy: user.id,
        });
      }
    } else if (operation.charge) {
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
      ...(operation.noCharge !== undefined ? { noCharge: operation.noCharge } : {}),
      ...(operation.action === 'start' && !visit.startedAt ? { startedAt: new Date() } : {}),
      ...(operation.action === 'complete' && !visit.completedAt ? { completedAt: new Date() } : {}),
      // La atención sin cita nació con un fin provisorio: al cerrarla, la
      // agenda debe mostrar lo que realmente duró. Nunca antes del inicio
      // más un minuto, aunque el reloj del teléfono haya ido adelantado.
      ...(operation.action === 'complete' && visit.origin === 'sin_cita'
        ? { endAt: new Date(Math.max(Date.now(), new Date(visit.scheduledAt).getTime() + 60_000)) }
        : {}),
    }).where(eq(appointments.id, visit.id));

    // Los pendientes derivados del cierre se crean en la misma transacción:
    // una cola aparte podría perderlos justo cuando la visita ya se cerró.
    if (operation.action === 'complete') {
      await createVisitFollowups(tx, {
        appointmentId: visit.id, patientId: visit.patientId, veterinarianId: visit.veterinarianId,
        invoiceId: invoice?.id ?? null, invoiceTotal: invoice ? toCents(invoice.total) : 0,
        paidCents: invoice ? await paidTotal(tx, invoice.id) : 0,
        aftercare: await recordedAftercare(tx, visit.id),
      });
    }

    const receivedAt = new Date();
    const result: VisitResult = {
      visitId: visit.id, recordId, invoiceId: invoice?.id ?? null, status,
      updatedAt: updatedAt.toISOString(), receivedAt: receivedAt.toISOString(),
    };
    await tx.insert(visitOperations).values({
      userId: user.id, operationId: operation.id, payloadHash: hash, result,
      occurredAt: operation.occurredAt ? new Date(operation.occurredAt) : null, receivedAt,
    });
    return result;
  });
}

/**
 * Indicaciones de las prestaciones efectivamente registradas en la visita.
 *
 * Se leen de la base y no de la operación en curso porque el cierre suele
 * llegar en dos pasos: primero un guardado que emite el cobro con las
 * prestaciones, y después el cierre, que ya no las trae. Derivarlas de la
 * operación dejaba sin tarea de seguimiento justo al flujo más habitual.
 */
async function recordedAftercare(tx: { select: any }, appointmentId: number): Promise<string[]> {
  const rows = await tx.select({ aftercare: services.aftercare })
    .from(visitServiceItems)
    .innerJoin(services, eq(visitServiceItems.serviceId, services.id))
    .where(and(eq(visitServiceItems.appointmentId, appointmentId), eq(visitServiceItems.status, 'realizada')))
    .limit(30);
  return rows.map((row: { aftercare: string | null }) => row.aftercare).filter((a: string | null): a is string => Boolean(a));
}

async function paidTotal(tx: { select: any }, invoiceId: number): Promise<number> {
  const rows = await tx.select({ amount: payments.amount }).from(payments).where(eq(payments.invoiceId, invoiceId));
  return rows.reduce((sum: number, row: { amount: string }) => sum + toCents(row.amount), 0);
}

/**
 * Une insumos declarados a mano con los que aporta cada prestación. Si el
 * mismo producto aparece por ambos caminos se suma una sola vez por
 * ubicación: de lo contrario el stock se descontaría dos veces por un solo
 * uso real.
 */
/**
 * Botiquín del que salen los insumos de una prestación cuando el
 * profesional no eligió uno. Si el veterinario tiene exactamente un
 * botiquín asignado, es de ahí: no es una suposición, es el único que
 * lleva. Con ninguno o con varios se usa el stock general, porque
 * adivinar descontaría de una ubicación equivocada y el recuento del
 * botiquín quedaría a la deriva sin que nadie lo note.
 */
async function soleAssignedLocation(tx: any, user: VisitUser): Promise<number | null> {
  if (user.role !== 'veterinario') return null;
  const rows = await tx.select({ id: stockLocations.id }).from(stockLocations)
    .where(and(eq(stockLocations.isActive, true), eq(stockLocations.assignedVetId, user.id)))
    .limit(2);
  return rows.length === 1 ? rows[0].id : null;
}

function mergeSupplies(manual: Supply[], resolved: ResolvedService[], defaultLocation: number | null): Supply[] {
  const merged = new Map<string, Supply>();
  const add = (supply: Supply) => {
    const key = `${supply.productId}:${supply.locationId ?? ''}`;
    const current = merged.get(key);
    if (current) current.quantity = Math.round((current.quantity + supply.quantity) * 1000) / 1000;
    else merged.set(key, { ...supply });
  };
  for (const supply of manual) add(supply);
  for (const item of resolved) for (const supply of item.supplies) add({ ...supply, locationId: defaultLocation });
  return [...merged.values()];
}

async function consumeSupplies(tx: any, user: VisitUser, supplies: Supply[], reason: string, recordId: number) {
  // Stable lock order avoids deadlocks between visits using multiple supplies.
  for (const supply of [...supplies].sort((a, b) => a.productId - b.productId || (a.locationId ?? 0) - (b.locationId ?? 0))) {
    if (supply.quantity <= 0) continue;
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
    await tx.insert(stockMovements).values({ productId: supply.productId, quantity: String(supply.quantity), type: 'consumo_interno', reason, referenceType: 'medical_record', referenceId: recordId, locationId: supply.locationId ?? null, userId: user.id });
  }
}
