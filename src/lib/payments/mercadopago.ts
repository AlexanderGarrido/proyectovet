import MercadoPago, { Preference } from 'mercadopago';

/**
 * Cliente de Mercado Pago compartido (link de pago + webhook). Lanza un
 * error claro si falta el access token en vez de fallar más abajo con un
 * error críptico del SDK.
 */
export function getMercadoPagoClient(): MercadoPago {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('MERCADOPAGO_ACCESS_TOKEN no está configurado. Agrégalo en las variables de entorno para activar el cobro con link de pago.');
  }
  return new MercadoPago({ accessToken, options: { timeout: 5000 } });
}

function getBaseUrl(): string {
  return (import.meta.env.BETTER_AUTH_URL || process.env.BETTER_AUTH_URL || '').replace(/\/$/, '');
}

/**
 * Genera un link de pago (Checkout Pro) para que el tutor pague una factura
 * desde su teléfono, sin manejar efectivo ni POS físico en la visita.
 *
 * Requiere la variable de entorno MERCADOPAGO_ACCESS_TOKEN (token de
 * producción o de prueba de tu cuenta de Mercado Pago). Sin ella, esta
 * función lanza un error claro — no hay forma de generar el link sin tus
 * propias credenciales de comercio.
 */
export interface InvoicePaymentLinkInput {
  invoiceId: number;
  invoiceNumber: string;
  total: number;
  ownerName: string;
}

export async function createInvoicePaymentLink(input: InvoicePaymentLinkInput): Promise<string> {
  const client = getMercadoPagoClient();
  const preference = new Preference(client);
  const baseUrl = getBaseUrl();

  const result = await preference.create({
    body: {
      items: [
        {
          id: String(input.invoiceId),
          title: `Factura ${input.invoiceNumber} — Alma Veterinaria`,
          description: `Pago de ${input.ownerName}`,
          quantity: 1,
          unit_price: input.total,
          currency_id: 'CLP',
        },
      ],
      external_reference: `invoice-${input.invoiceId}`,
      // Sin esto, un pago hecho por el tutor NUNCA marca la factura como
      // pagada automáticamente: alguien del staff tenía que conciliar a mano
      // revisando el dashboard de Mercado Pago. Ver src/pages/api/payments/webhook.ts.
      notification_url: baseUrl ? `${baseUrl}/api/payments/webhook` : undefined,
      back_urls: baseUrl
        ? {
            success: `${baseUrl}/facturacion/${input.invoiceId}`,
            failure: `${baseUrl}/facturacion/${input.invoiceId}`,
            pending: `${baseUrl}/facturacion/${input.invoiceId}`,
          }
        : undefined,
    },
  });

  if (!result.init_point) {
    throw new Error('Mercado Pago no devolvió un link de pago válido.');
  }
  return result.init_point;
}
