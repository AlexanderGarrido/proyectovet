import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { invoices } from '../../../../db/schema/billing';
import { owners } from '../../../../db/schema/patients';
import { eq } from 'drizzle-orm';
import { createInvoicePaymentLink } from '../../../../lib/payments/mercadopago';

// El veterinario en el domicilio también debe poder generar el link de pago
// en el momento — antes solo admin/recepcionista podían, desde la clínica.
const STAFF_ROLES = ['admin', 'recepcionista', 'veterinario'];

export const POST: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  if (!STAFF_ROLES.includes(user.role)) return new Response(JSON.stringify({ error: 'Sin permiso' }), { status: 403 });

  const id = Number(params.id);
  if (!id || isNaN(id)) return new Response(JSON.stringify({ error: 'ID inválido' }), { status: 400 });

  const [invoice] = await db
    .select({
      id: invoices.id, invoiceNumber: invoices.invoiceNumber, total: invoices.total, status: invoices.status,
      ownerFirstName: owners.firstName, ownerLastName: owners.lastName,
    })
    .from(invoices)
    .leftJoin(owners, eq(invoices.ownerId, owners.id))
    .where(eq(invoices.id, id));

  if (!invoice) return new Response(JSON.stringify({ error: 'Factura no encontrada' }), { status: 404 });
  if (invoice.status === 'pagada' || invoice.status === 'anulada') {
    return new Response(JSON.stringify({ error: 'Esta factura ya no admite pago' }), { status: 400 });
  }

  try {
    const url = await createInvoicePaymentLink({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      total: parseFloat(invoice.total),
      ownerName: `${invoice.ownerFirstName ?? ''} ${invoice.ownerLastName ?? ''}`.trim(),
    });
    return new Response(JSON.stringify({ url }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo generar el link de pago';
    return new Response(JSON.stringify({ error: message }), { status: 501, headers: { 'Content-Type': 'application/json' } });
  }
};
