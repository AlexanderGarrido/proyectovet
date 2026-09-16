import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rows: [] as unknown[][], locks: vi.fn(), insert: vi.fn() }));
vi.mock('../../../db', () => {
  const tx = {
    select: vi.fn(() => {
      const rows = mocks.rows.shift() ?? [];
      const chain: any = { from: () => chain, where: () => chain,
        for: (mode: string) => { mocks.locks(mode); return chain; },
        then: (resolve: any) => Promise.resolve(rows).then(resolve) };
      return chain;
    }),
    insert: mocks.insert,
  };
  return { db: { transaction: async (callback: any) => callback(tx) } };
});
import { POST as invoicePost } from '../invoices/index';
import { POST as paymentPost } from '../invoices/payment';
const context = (body: unknown) => ({
  request: new Request('http://localhost/api/invoices', { method: 'POST', body: JSON.stringify(body) }),
  locals: { user: { id: 'admin', role: 'admin' } },
} as any);
describe('billing writer locks', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.rows.length = 0; });
  it('locks appointment and returns the existing charge instead of duplicating it', async () => {
    mocks.rows.push([{ ownerId: 1, patientId: 2 }], [{ id: 42 }]);
    const res = await invoicePost(context({ ownerId: 1, patientId: 2, appointmentId: 3, items: [{ description: 'Consulta', quantity: 1, unitPrice: 100 }] }));
    expect(res.status).toBe(409);
    expect((await res.json()).invoiceId).toBe(42);
    expect(mocks.locks).toHaveBeenCalledWith('update');
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('reads the current balance under invoice lock and rejects excess manual payment', async () => {
    mocks.rows.push([{ id: 42, total: '100', status: 'parcial' }], [{ amount: '80' }]);
    const res = await paymentPost(context({ invoiceId: 42, amount: 30, method: 'efectivo' }));
    expect(res.status).toBe(400);
    expect(mocks.locks).toHaveBeenCalledWith('update');
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
