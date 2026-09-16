import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const rows: unknown[][] = [];
  const insert = vi.fn(() => ({ values: vi.fn(() => ({ returning: async () => [{ id: 10 }] })) }));
  const tx = {
    execute: vi.fn(async () => undefined),
    select: vi.fn(() => ({ from: () => ({ where: async () => rows.shift() ?? [] }) })),
    insert,
  };
  return { rows, tx, transaction: vi.fn(async (callback) => callback(tx)) };
});
vi.mock('../../../db', () => ({ db: { transaction: mocks.transaction } }));
import { POST } from '../appointments/index';
import { PUT } from '../appointments/[id]';

const base = { patientId: 1, ownerId: 2, veterinarianId: 'vet', scheduledAt: '2026-09-16T13:00:00Z', endAt: '2026-09-16T14:00:00Z', type: 'consulta' };
const context = (body: unknown = base) => ({
  request: new Request('http://localhost/api/appointments', { method: 'POST', body: JSON.stringify(body) }),
  locals: { user: { id: 'admin', role: 'admin' } },
} as any);

describe('appointment scheduling integrity', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.rows.length = 0; });
  it('rejects invalid timestamps before touching the database', async () => {
    expect((await POST(context({ ...base, scheduledAt: 'invalid' }))).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('rejects a patient belonging to another owner', async () => {
    mocks.rows.push([{ id: 1, ownerId: 99 }]);
    expect((await POST(context())).status).toBe(400);
    expect(mocks.tx.insert).not.toHaveBeenCalled();
  });
  it('rejects inactive veterinarians', async () => {
    mocks.rows.push([{ ownerId: 2 }], [{ role: 'veterinario', isActive: false }]);
    expect((await POST(context())).status).toBe(400);
    expect(mocks.tx.insert).not.toHaveBeenCalled();
  });
  it('rejects an overlapping appointment without inserting', async () => {
    mocks.rows.push([{ ownerId: 2 }], [{ role: 'veterinario', isActive: true }], [{ id: 9 }]);
    expect((await POST(context())).status).toBe(409);
    expect(mocks.tx.execute).toHaveBeenCalledOnce();
    expect(mocks.tx.insert).not.toHaveBeenCalled();
  });
  it('creates a validated appointment within the locked transaction', async () => {
    mocks.rows.push([{ ownerId: 2 }], [{ role: 'veterinario', isActive: true }], []);
    expect((await POST(context())).status).toBe(201);
    expect(mocks.tx.execute).toHaveBeenCalledOnce();
    expect(mocks.tx.insert).toHaveBeenCalledOnce();
  });
  it('rejects a partial reschedule whose start exceeds the persisted end', async () => {
    mocks.rows.push([{ veterinarianId: 'vet', scheduledAt: new Date(base.scheduledAt), endAt: new Date(base.endAt) }]);
    expect((await PUT({ ...context({ scheduledAt: '2026-09-16T15:00:00Z' }), params: { id: '10' } })).status).toBe(400);
  });
  it('rejects veterinarian edits to another assigned veterinarian', async () => {
    mocks.rows.push([{ veterinarianId: 'other-vet' }]);
    const ctx = context({ notes: 'Changed' });
    ctx.locals.user = { id: 'vet', role: 'veterinario' };
    expect((await PUT({ ...ctx, params: { id: '10' } })).status).toBe(403);
  });
});
