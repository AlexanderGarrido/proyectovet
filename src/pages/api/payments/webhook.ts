import type { APIRoute } from 'astro';
import { Payment as MPPayment, WebhookSignatureValidator } from 'mercadopago';
import { db } from '../../../db';
import { invoices, payments } from '../../../db/schema/billing';
import { eq } from 'drizzle-orm';
import { getMercadoPagoClient } from '../../../lib/payments/mercadopago';
import { jsonError, jsonOk } from '../../../lib/http';
import { logAudit } from '../../../lib/audit';
import { toCents, fromCents } from '../../../lib/money';

/**
 * Webhook de Mercado Pago: cuando un tutor paga desde el link de Checkout
 * Pro, MP llama a esta ruta (server-to-server, sin sesión de usuario) para
 * avisar el resultado. Antes de este endpoint, un pago hecho por el link
 * NUNCA marcaba la factura como pagada — requería conciliación manual.
 *
 * Es una ruta pública (ver middleware.ts) porque MP no tiene nuestra cookie
 * de sesión; la autenticidad de la notificación se verifica con la firma
 * HMAC de la cabecera `x-signature` (WebhookSignatureValidator oficial del
 * SDK), no con auth de usuario.
 */
export const POST: APIRoute = async ({ request, url }) => {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[mp-webhook] MERCADOPAGO_WEBHOOK_SECRET no configurado — notificación rechazada');
    return jsonError(501, 'Webhook no configurado');
  }

  const xSignature = request.headers.get('x-signature');
  const xRequestId = request.headers.get('x-request-id');
  const dataId = url.searchParams.get('data.id') || url.searchParams.get('id');

  try {
    WebhookSignatureValidator.validate({
      xSignature,
      xRequestId,
      dataId,
      secret,
      toleranceSeconds: 300, // ventana de 5 min — mitiga ataques de repetición
    });
  } catch (err) {
    console.error('[mp-webhook] firma inválida:', err instanceof Error ? err.message : err);
    return jsonError(401, 'Firma inválida');
  }

  const body = await request.json().catch(() => null as any);
  const topic = body?.type || url.searchParams.get('type');
  // Mercado Pago envía varios topics (merchant_order, payment, etc.); solo
  // nos interesan las notificaciones de pago.
  if (topic !== 'payment') return jsonOk({ received: true });

  const paymentId = String(body?.data?.id || dataId || '');
  if (!paymentId) return jsonError(400, 'Falta data.id');

  let mpPayment;
  try {
    const client = getMercadoPagoClient();
    mpPayment = await new MPPayment(client).get({ id: paymentId });
  } catch (err) {
    console.error('[mp-webhook] no se pudo consultar el pago en Mercado Pago:', err instanceof Error ? err.message : err);
    return jsonError(502, 'No se pudo verificar el pago con Mercado Pago');
  }

  if (mpPayment.status !== 'approved') {
    return jsonOk({ received: true, status: mpPayment.status });
  }

  const externalRef = mpPayment.external_reference || '';
  const invoiceId = Number(String(externalRef).replace('invoice-', ''));
  if (!invoiceId || !Number.isInteger(invoiceId)) {
    return jsonError(400, 'external_reference inválida');
  }

  // Idempotencia: Mercado Pago reintenta notificaciones. Si ya registramos
  // este pago (mismo id de MP), no lo duplicamos.
  const reference = `mercadopago:${paymentId}`;
  const [existing] = await db.select({ id: payments.id }).from(payments).where(eq(payments.reference, reference));
  if (existing) return jsonOk({ received: true, alreadyProcessed: true });

  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!invoice) return jsonError(404, 'Factura no encontrada');
  if (invoice.status === 'pagada' || invoice.status === 'anulada') {
    return jsonOk({ received: true });
  }

  const amount = mpPayment.transaction_amount ?? 0;
  const amountCents = toCents(amount);

  await db.insert(payments).values({
    invoiceId,
    amount: fromCents(amountCents),
    method: 'otro',
    reference,
    date: new Date(),
    // No hay usuario de sesión (llamada server-to-server) — se atribuye a
    // quien emitió la factura, y queda igualmente trazado en auditoría.
    receivedBy: invoice.createdBy,
  });

  const allPayments = await db.select().from(payments).where(eq(payments.invoiceId, invoiceId));
  const paidCents = allPayments.reduce((sum, p) => sum + toCents(p.amount), 0);
  const totalCents = toCents(invoice.total);
  const newStatus = paidCents >= totalCents ? 'pagada' : paidCents > 0 ? 'parcial' : invoice.status;

  await db.update(invoices).set({ status: newStatus }).where(eq(invoices.id, invoiceId));

  await logAudit({
    userId: invoice.createdBy,
    action: 'invoice.payment_webhook',
    entityType: 'invoice',
    entityId: invoiceId,
    metadata: { mercadopagoPaymentId: paymentId, amount, newStatus },
  });

  return jsonOk({ received: true, newStatus });
};
