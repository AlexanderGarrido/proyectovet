import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appointments } from '../db/schema/appointments';
import { medicalRecords } from '../db/schema/medical';
import { payments, invoices } from '../db/schema/billing';
import { products } from '../db/schema/inventory';
import { visitOperations } from '../db/schema/visit-operations';
import type { VisitOperation } from './visit-types';

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('../db', () => ({ db: { transaction: mocks.transaction } }));
import { saveVisit } from './save-visit';

const user = { id: 'vet-1', name: 'Veterinario', role: 'veterinario' };
const version = '2026-09-16T12:00:00.000Z';
const visit = { id: 7, veterinarianId: user.id, patientId: 2, ownerId: 3, status: 'en_curso', updatedAt: version };
const operation = (extra: Partial<VisitOperation> = {}): VisitOperation => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', visitId: 7, expectedUpdatedAt: version, action: 'save', ...extra,
});

// Writes become durable only when the transaction callback resolves. All read
// results are explicit, keeping these tests independent of a database service.
function transaction(reads: unknown[][], fail?: { table: unknown; kind: 'insert' | 'update'; empty?: boolean }) {
  const staged: { table: unknown; value: any; kind: string }[] = [];
  const committed: typeof staged = [];
  const chain = (result: () => unknown): any => {
    const query: any = {};
    for (const method of ['where', 'for', 'limit', 'returning']) query[method] = () => query;
    query.then = (resolve: any, reject: any) => Promise.resolve().then(result).then(resolve, reject);
    return query;
  };
  const write = (table: unknown, kind: 'insert' | 'update') => (value: unknown) => chain(() => {
    if (fail && fail.table === table && fail.kind === kind) {
      if (fail.empty) return [];
      throw new Error('Storage unavailable');
    }
    staged.push({ table, value, kind });
    return [{ id: 19, ...value as object }];
  });
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(() => ({ from: () => chain(() => {
      if (!reads.length) throw new Error('Unexpected read');
      return reads.shift();
    }) })),
    insert: vi.fn((table) => ({ values: write(table, 'insert') })),
    update: vi.fn((table) => ({ set: write(table, 'update') })),
  };
  mocks.transaction.mockImplementation(async (callback) => {
    const result = await callback(tx);
    committed.push(...staged);
    return result;
  });
  return { tx, staged, committed };
}

beforeEach(() => vi.clearAllMocks());

describe('saveVisit transaction orchestration', () => {
  it('returns the original receipt on retry without clinical, inventory or payment writes', async () => {
    const op = operation({ record: { reason: 'Control' }, payment: { amount: 100, method: 'efectivo' } });
    const result = { visitId: 7, recordId: 9, invoiceId: 10, status: 'completada', updatedAt: version };
    const receipt = { payloadHash: createHash('sha256').update(JSON.stringify(op)).digest('hex'), result };
    const state = transaction([[visit], [receipt]]);
    expect(await saveVisit(user, op)).toEqual(result);
    expect(state.tx.insert).not.toHaveBeenCalled();
    expect(state.tx.update).not.toHaveBeenCalled();
    expect(state.tx.select).toHaveBeenCalledTimes(2);
  });

  it('rejects reuse of the same operation key with a different payload', async () => {
    const state = transaction([[visit], [{ payloadHash: 'different-payload' }]]);
    await expect(saveVisit(user, operation())).rejects.toMatchObject({ status: 409 });
    expect(state.staged).toEqual([]);
  });

  it.each(['stock', 'payment'] as const)('rolls back clinical writes when %s fails', async (failure) => {
    const reads = failure === 'payment' ? [[visit], [], [], [{ id: 10, total: '100', status: 'emitida' }], []] : [[visit], [], [], []];
    const state = transaction(reads, failure === 'stock' ? { table: products, kind: 'update', empty: true } : { table: payments, kind: 'insert' });
    const op = operation({
      record: { reason: 'Control', ...(failure === 'stock' ? { supplies: [{ productId: 1, quantity: 1 }] } : {}) },
      ...(failure === 'payment' ? { payment: { amount: 100, method: 'efectivo' as const } } : {}),
    });
    await expect(saveVisit(user, op)).rejects.toThrow();
    expect(state.staged.some((write) => write.table === medicalRecords)).toBe(true);
    expect(state.committed).toEqual([]);
    expect(state.staged.some((write) => write.table === appointments || write.table === visitOperations)).toBe(false);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it('completes an offline chain using the predecessor receipt version', async () => {
    const startedAt = '2026-09-16T13:00:00.000Z';
    const state = transaction([[{ ...visit, updatedAt: startedAt }], [], [], [], [{ result: { visitId: 7, updatedAt: startedAt } }]]);
    const result = await saveVisit(user, operation({ action: 'complete', predecessorId: 'prior-start', record: { reason: 'Control' }, noCharge: true }));
    expect(result).toMatchObject({ visitId: 7, status: 'completada', recordId: 19 });
    expect(new Date(result.updatedAt).toISOString()).toBe(result.updatedAt);
    expect(state.committed.find((write) => write.table === visitOperations)?.value.result).toEqual(result);
  });

  it.each([{ previous: [] }, { previous: [{ result: { visitId: 999, updatedAt: version } }] }])('rejects a missing or foreign-visit predecessor', async ({ previous }) => {
    const state = transaction([[visit], [], [], [], previous]);
    await expect(saveVisit(user, operation({ predecessorId: 'prior-start' }))).rejects.toMatchObject({ status: 409 });
    expect(state.staged).toEqual([]);
  });

  it.each([
    [{ ...user, id: 'other-vet' }, {}, 404],
    [{ ...user, role: 'cliente' }, {}, 404],
    [{ ...user, role: 'recepcionista' }, { record: { reason: 'Control' } }, 403],
    [{ ...user, role: 'recepcionista' }, { action: 'complete' }, 403],
  ] as const)('enforces assigned veterinarian and clinical permissions (%j)', async (actor, change, status) => {
    const state = transaction([[visit], []]);
    await expect(saveVisit(actor, operation(change))).rejects.toMatchObject({ status });
    expect(state.staged).toEqual([]);
  });

  it('rejects overpayment before inserting a payment or changing invoice status', async () => {
    const state = transaction([[visit], [], [], [{ id: 10, total: '100', status: 'parcial' }], [{ amount: '80' }]]);
    await expect(saveVisit(user, operation({ payment: { amount: 30, method: 'efectivo' } }))).rejects.toMatchObject({ status: 409 });
    expect(state.staged.filter((write) => write.table === payments || write.table === invoices)).toEqual([]);
  });
});
