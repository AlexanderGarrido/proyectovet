/**
 * Tests del webhook de Mercado Pago (src/pages/api/payments/webhook.ts).
 * Cubre el hallazgo ALTO A4 de la auditoría: sin este endpoint, un pago
 * hecho por el link de Checkout Pro nunca marcaba la factura como pagada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { validateMock, paymentGetMock } = vi.hoisted(() => ({
  validateMock: vi.fn(),
  paymentGetMock: vi.fn(),
}));

vi.mock('mercadopago', () => ({
  default: class MockMercadoPago {},
  Payment: class MockPayment {
    get = paymentGetMock;
  },
  WebhookSignatureValidator: { validate: validateMock },
}));

vi.mock('../../../lib/payments/mercadopago', () => ({
  getMercadoPagoClient: vi.fn(() => ({})),
}));

function makeChain(resolvedValue: any[]) {
  const chain: any = {};
  ['from', 'where'].forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  chain.then = (resolve: any, reject: any) => Promise.resolve(resolvedValue).then(resolve, reject);
  return chain;
}

vi.mock('../../../db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
  },
}));
vi.mock('../../../lib/audit', () => ({ logAudit: vi.fn() }));

import { db } from '../../../db';
import { POST as webhookPOST } from '../payments/webhook';

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/payments/webhook?data.id=123&type=payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-signature': 'ts=1,v1=abc', 'x-request-id': 'req-1', ...headers },
    body: JSON.stringify(body),
  });
}

function ctx(request: Request) {
  return { request, url: new URL(request.url) } as any;
}

describe('POST /api/payments/webhook', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...OLD_ENV, MERCADOPAGO_WEBHOOK_SECRET: 'test-secret', MERCADOPAGO_ACCESS_TOKEN: 'test-token' };
  });

  it('501 si falta MERCADOPAGO_WEBHOOK_SECRET (nunca acepta notificaciones sin poder verificarlas)', async () => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = '';
    const res = await webhookPOST(ctx(makeRequest({ type: 'payment', data: { id: '123' } })));
    expect(res.status).toBe(501);
    expect(validateMock).not.toHaveBeenCalled();
  });

  it('401 si la firma HMAC es inválida (rechaza notificaciones falsificadas)', async () => {
    validateMock.mockImplementation(() => {
      throw new Error('signature mismatch');
    });
    const res = await webhookPOST(ctx(makeRequest({ type: 'payment', data: { id: '123' } })));
    expect(res.status).toBe(401);
    expect(paymentGetMock).not.toHaveBeenCalled();
  });

  it('200 y no consulta el pago si el topic no es "payment"', async () => {
    validateMock.mockReturnValue(undefined);
    const res = await webhookPOST(ctx(makeRequest({ type: 'merchant_order', data: { id: '123' } })));
    expect(res.status).toBe(200);
    expect(paymentGetMock).not.toHaveBeenCalled();
  });

  it('200 sin registrar pago si el estado en Mercado Pago no es "approved"', async () => {
    validateMock.mockReturnValue(undefined);
    paymentGetMock.mockResolvedValue({ status: 'pending', external_reference: 'invoice-1', transaction_amount: 100 });
    const res = await webhookPOST(ctx(makeRequest({ type: 'payment', data: { id: '123' } })));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.status).toBe('pending');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('idempotencia: si el pago ya fue procesado (mismo reference), no lo duplica', async () => {
    validateMock.mockReturnValue(undefined);
    paymentGetMock.mockResolvedValue({ status: 'approved', external_reference: 'invoice-1', transaction_amount: 100 });
    vi.mocked(db.select).mockReturnValueOnce(makeChain([{ id: 1 }]) as any); // ya existe con ese reference
    const res = await webhookPOST(ctx(makeRequest({ type: 'payment', data: { id: '123' } })));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.alreadyProcessed).toBe(true);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('registra el pago y marca la factura como pagada cuando el monto cubre el total', async () => {
    validateMock.mockReturnValue(undefined);
    paymentGetMock.mockResolvedValue({ status: 'approved', external_reference: 'invoice-1', transaction_amount: 100 });
    const select = vi.mocked(db.select);
    select.mockReturnValueOnce(makeChain([]) as any); // sin pago previo con ese reference
    select.mockReturnValueOnce(makeChain([{ id: 1, total: '100.00', status: 'emitida', createdBy: 'staff-1' }]) as any); // factura
    select.mockReturnValueOnce(makeChain([{ amount: '100.00' }]) as any); // pagos tras insertar

    const res = await webhookPOST(ctx(makeRequest({ type: 'payment', data: { id: '123' } })));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.newStatus).toBe('pagada');
    expect(db.insert).toHaveBeenCalled();
    expect(db.update).toHaveBeenCalled();
  });
});
