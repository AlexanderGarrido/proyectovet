import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { invoices, payments } from '../../../db/schema/billing';
import { eq } from 'drizzle-orm';
import { paymentCreateSchema, zodError, parseJsonBody } from '../../../lib/schemas';
import { requirePermission } from '../../../lib/guard';
import { jsonError, jsonOk } from '../../../lib/http';
import { toCents, fromCents } from '../../../lib/money';

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  // SEGURIDAD: antes solo exigía sesión — cualquier tutor podía registrar un
  // pago falso y marcar cualquier factura (propia o ajena) como pagada.
  // Solo el staff que efectivamente cobra puede registrar pagos manuales.
  const guardErr = requirePermission(user, 'payments', 'write');
  if (guardErr) return guardErr;

  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const result_ = paymentCreateSchema.safeParse(parsed.data);
  if (!result_.success) return zodError(result_.error);
  const { amount, method, reference } = result_.data;
  const invoiceId = Number((parsed.data as any).invoiceId);
  if (!invoiceId || !Number.isInteger(invoiceId) || invoiceId < 1) {
    return jsonError(400, 'invoiceId: Se requiere un ID de factura válido');
  }

  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!invoice) return jsonError(404, 'Factura no encontrada');
  if (invoice.status === 'pagada' || invoice.status === 'anulada') {
    return jsonError(400, 'Esta factura ya no admite pagos');
  }

  const allPayments = await db.select().from(payments).where(eq(payments.invoiceId, invoiceId));
  const alreadyPaidCents = allPayments.reduce((sum, p) => sum + toCents(p.amount), 0);
  const totalCents = toCents(invoice.total);
  const amountCents = toCents(amount);
  if (alreadyPaidCents + amountCents > totalCents) {
    return jsonError(400, `El monto excede el saldo pendiente (quedan ${fromCents(totalCents - alreadyPaidCents)})`);
  }

  await db.insert(payments).values({
    invoiceId,
    amount: fromCents(amountCents),
    method,
    reference: reference || null,
    date: new Date(),
    receivedBy: user!.id,
  });

  const paidCents = alreadyPaidCents + amountCents;
  const newStatus = paidCents >= totalCents ? 'pagada' : paidCents > 0 ? 'parcial' : invoice.status;

  await db.update(invoices).set({ status: newStatus }).where(eq(invoices.id, invoiceId));

  return jsonOk({ success: true, newStatus });
};
