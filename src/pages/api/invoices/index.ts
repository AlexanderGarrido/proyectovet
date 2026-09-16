import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { invoices, invoiceItems } from '../../../db/schema/billing';
import { appointments } from '../../../db/schema/appointments';
import { positiveId, verifyInvoiceContext } from '../../../lib/form-context';
import { jsonError } from '../../../lib/http';
import { owners, patients } from '../../../db/schema/patients';
import { eq, desc, and, ne } from 'drizzle-orm';
import { invoiceSchema, zodError, parseJsonBody } from '../../../lib/schemas';
import { requirePermission, requireUnscopedPermission } from '../../../lib/guard';

export const GET: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  // Este listado no filtra por pertenencia — no puede dejar pasar a un
  // tutor (que solo tiene "invoices:read:own"), o vería las facturas de
  // todos los tutores de la clínica, no solo las suyas.
  const guardErr = requireUnscopedPermission(user, 'invoices', 'read');
  if (guardErr) return guardErr;

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || '100')));
  const offset = (page - 1) * limit;

  const result = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      date: invoices.date,
      subtotal: invoices.subtotal,
      taxAmount: invoices.taxAmount,
      discount: invoices.discount,
      total: invoices.total,
      status: invoices.status,
      ownerId: invoices.ownerId,
      ownerFirstName: owners.firstName,
      ownerLastName: owners.lastName,
    })
    .from(invoices)
    .leftJoin(owners, eq(invoices.ownerId, owners.id))
    .orderBy(desc(invoices.date))
    .limit(limit)
    .offset(offset);

  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'invoices', 'write');
  if (guardErr) return guardErr;

  const input = await parseJsonBody(request);
  if ('error' in input) return input.error;
  const body = input.data as Record<string, unknown>;
  const parsed = invoiceSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const { ownerId, items, taxRate, discount, notes } = parsed.data;
  const appointmentId = body.appointmentId == null ? undefined : positiveId(body.appointmentId);
  const patientId = body.patientId == null ? undefined : positiveId(body.patientId);
  if ((body.appointmentId != null && !appointmentId) || (body.patientId != null && !patientId)) return jsonError(400, 'Contexto de cobro inválido');

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const tax = taxRate ? (subtotal * taxRate) / 100 : 0;
  const disc = discount || 0;
  const total = subtotal + tax - disc;
  if (total < 0) {
    return new Response(JSON.stringify({ error: 'El total no puede ser negativo' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const invoiceNumber = `FAC-${Date.now()}`;

  const newInvoice = await db.transaction(async (tx) => {
    if (appointmentId) {
      const [appointment] = await tx.select({ ownerId: appointments.ownerId, patientId: appointments.patientId })
        .from(appointments).where(eq(appointments.id, appointmentId)).for('update');
      if (!appointment) return jsonError(404, 'Cita no encontrada');
      try { verifyInvoiceContext(appointment, { ownerId, patientId }); }
      catch (e) { return jsonError(400, (e as Error).message); }
      const [existing] = await tx.select({ id: invoices.id }).from(invoices).where(and(
        eq(invoices.appointmentId, appointmentId), ne(invoices.status, 'anulada'),
      ));
      if (existing) return new Response(JSON.stringify({ error: 'La cita ya tiene un cobro activo', invoiceId: existing.id }), {
        status: 409, headers: { 'Content-Type': 'application/json' },
      });
    } else if (patientId) {
      const [patient] = await tx.select({ ownerId: patients.ownerId }).from(patients).where(eq(patients.id, patientId));
      if (!patient || patient.ownerId !== ownerId) return jsonError(400, 'El responsable no corresponde al paciente');
    }

    const [created] = await tx.insert(invoices).values({
      invoiceNumber,
      ownerId: Number(ownerId),
      appointmentId: appointmentId ? Number(appointmentId) : null,
      date: new Date(),
      subtotal: String(subtotal.toFixed(2)),
      taxRate: String(taxRate || '0'),
      taxAmount: String(tax.toFixed(2)),
      discount: String(disc.toFixed(2)),
      total: String(total.toFixed(2)),
      notes,
      createdBy: user!.id,
    }).returning();

    const invoiceId = created.id;
    await tx.insert(invoiceItems).values(
      items.map((item) => ({
        invoiceId,
        productId: item.productId || null,
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: String(item.unitPrice),
        subtotal: String((item.quantity * item.unitPrice).toFixed(2)),
      }))
    );

    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
    return inv;
  });
  if (newInvoice instanceof Response) return newInvoice;
  return new Response(JSON.stringify(newInvoice), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
