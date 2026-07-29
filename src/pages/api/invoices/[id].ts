import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { invoices, invoiceItems, payments } from '../../../db/schema/billing';
import { owners } from '../../../db/schema/patients';
import { eq, desc } from 'drizzle-orm';
import { invoiceUpdateSchema, zodError, parseJsonBody } from '../../../lib/schemas';
import { logAudit } from '../../../lib/audit';
import { requirePermission, requireUnscopedPermission } from '../../../lib/guard';

// SEGURIDAD (IDOR): antes solo exigía sesión — cualquier tutor autenticado
// podía leer cualquier factura ajena (montos, pagos) y, peor, marcar
// cualquier factura como "pagada" o "anulada" por PUT sin verificar rol.
// El portal del tutor ya trae sus propias facturas embebidas en
// /api/client/portal; no hay ningún flujo de UI que llame este endpoint
// para un tutor. requireUnscopedPermission rechaza a tutor por completo en
// el GET (solo tiene "invoices:read:own"); requirePermission rechaza el
// PUT directamente (tutor no tiene "invoices:write" en ninguna forma).

export const GET: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  const guardErr = requireUnscopedPermission(user, 'invoices', 'read');
  if (guardErr) return guardErr;

  const id = Number(params.id);
  if (!id || isNaN(id) || id <= 0) {
    return new Response(JSON.stringify({ error: 'ID inválido' }), { status: 400 });
  }
  const [invoice] = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      date: invoices.date,
      subtotal: invoices.subtotal,
      taxRate: invoices.taxRate,
      taxAmount: invoices.taxAmount,
      discount: invoices.discount,
      total: invoices.total,
      status: invoices.status,
      notes: invoices.notes,
      ownerId: invoices.ownerId,
      ownerFirstName: owners.firstName,
      ownerLastName: owners.lastName,
      ownerEmail: owners.email,
      ownerPhone: owners.phone,
    })
    .from(invoices)
    .leftJoin(owners, eq(invoices.ownerId, owners.id))
    .where(eq(invoices.id, id));

  if (!invoice) return new Response(JSON.stringify({ error: 'No encontrado' }), { status: 404 });

  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id));
  const invoicePayments = await db.select().from(payments).where(eq(payments.invoiceId, id)).orderBy(desc(payments.date));

  return new Response(JSON.stringify({ ...invoice, items, payments: invoicePayments }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'invoices', 'write');
  if (guardErr) return guardErr;

  const id = Number(params.id);
  if (!id || isNaN(id) || id <= 0) {
    return new Response(JSON.stringify({ error: 'ID inválido' }), { status: 400 });
  }
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const result = invoiceUpdateSchema.safeParse(parsed.data);
  if (!result.success) return zodError(result.error);
  const { status, notes } = result.data;

  const [before] = await db.select({ status: invoices.status, invoiceNumber: invoices.invoiceNumber }).from(invoices).where(eq(invoices.id, id));
  await db.update(invoices).set({ status, notes }).where(eq(invoices.id, id));

  if (status === 'anulada' && before?.status !== 'anulada') {
    await logAudit({
      userId: user!.id, userName: user!.name, action: 'invoice.void',
      entityType: 'invoice', entityId: id, metadata: { invoiceNumber: before?.invoiceNumber, previousStatus: before?.status },
    });
  }

  const [updated] = await db.select().from(invoices).where(eq(invoices.id, id));
  return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
};
