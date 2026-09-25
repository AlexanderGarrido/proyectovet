import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appointments } from '../db/schema/appointments';
import { visitOperations } from '../db/schema/visit-operations';

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('../db', () => ({ db: { transaction: mocks.transaction } }));
import { openVisit } from './open-visit';

const vet = { id: 'vet-1', name: 'Vet', role: 'veterinario' };
const now = new Date('2026-09-24T15:00:00.000Z');
const input = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', patientId: 5, occurredAt: '2026-09-24T14:50:00.000Z' };
const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');

// Las lecturas se entregan en orden: comprobante previo, paciente.
function transaction(reads: unknown[][]) {
  const inserts: { table: unknown; value: any }[] = [];
  const chain = (result: () => unknown): any => {
    const q: any = {};
    for (const m of ['where', 'for', 'limit', 'returning']) q[m] = () => q;
    q.then = (res: any, rej: any) => Promise.resolve().then(result).then(res, rej);
    return q;
  };
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(() => ({ from: () => chain(() => reads.shift() ?? []) })),
    insert: vi.fn((table) => ({ values: (value: any) => chain(() => { inserts.push({ table, value }); return [{ id: 41 }]; }) })),
  };
  mocks.transaction.mockImplementation(async (cb) => cb(tx));
  return { tx, inserts };
}

beforeEach(() => vi.clearAllMocks());

describe('openVisit', () => {
  it('crea una cita sin_cita en curso con la hora declarada', async () => {
    const { inserts } = transaction([[], [{ id: 5, ownerId: 9, isActive: true }]]);
    const result = await openVisit(vet, input, now);
    const appt = inserts.find((i) => i.table === appointments)!.value;
    expect(appt).toMatchObject({ patientId: 5, ownerId: 9, veterinarianId: 'vet-1', origin: 'sin_cita', status: 'en_curso', type: 'consulta', travelBufferMinutes: 0 });
    expect(appt.scheduledAt.toISOString()).toBe(input.occurredAt);
    expect(appt.startedAt.toISOString()).toBe(input.occurredAt);
    expect(appt.endAt.toISOString()).toBe('2026-09-24T15:20:00.000Z');
    expect(result).toMatchObject({ visitId: 41, recordId: null, invoiceId: null, status: 'en_curso', updatedAt: appt.updatedAt.toISOString() });
    expect(inserts.find((i) => i.table === visitOperations)!.value).toMatchObject({ userId: 'vet-1', operationId: input.id, payloadHash: hash, result });
  });

  it('un reintento con el mismo id devuelve el comprobante sin crear otra cita', async () => {
    const previous = { visitId: 41, recordId: null, invoiceId: null, status: 'en_curso', updatedAt: now.toISOString() };
    const { inserts } = transaction([[{ payloadHash: hash, result: previous }]]);
    await expect(openVisit(vet, input, now)).resolves.toEqual(previous);
    expect(inserts).toEqual([]);
  });

  it('el mismo id con otros datos es un conflicto', async () => {
    transaction([[{ payloadHash: 'otro', result: {} }]]);
    await expect(openVisit(vet, input, now)).rejects.toMatchObject({ status: 409 });
  });

  it('recepción no puede abrir una atención', async () => {
    await expect(openVisit({ ...vet, role: 'recepcionista' }, input, now)).rejects.toMatchObject({ status: 403 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('administración sí puede, y queda como quien atiende', async () => {
    const { inserts } = transaction([[], [{ id: 5, ownerId: 9, isActive: true }]]);
    await openVisit({ ...vet, id: 'admin-1', role: 'admin' }, input, now);
    expect(inserts.find((i) => i.table === appointments)!.value.veterinarianId).toBe('admin-1');
  });

  it.each([
    [[], 404],
    [[{ id: 5, ownerId: 9, isActive: false }], 409],
  ] as const)('rechaza un paciente inexistente o inactivo (%j)', async (patient, status) => {
    const { inserts } = transaction([[], [...patient]]);
    await expect(openVisit(vet, input, now)).rejects.toMatchObject({ status });
    expect(inserts).toEqual([]);
  });

  it('rechaza una hora fuera de rango antes de crear nada', async () => {
    const { inserts } = transaction([[]]);
    await expect(openVisit(vet, { ...input, occurredAt: '2026-09-24T16:00:00.000Z' }, now)).rejects.toMatchObject({ status: 400 });
    expect(inserts).toEqual([]);
  });
});

describe('openVisit de una consulta pasada', () => {
  it('guarda origin pasada, sin inicio medido y sin el tope de 7 días', async () => {
    const past = { ...input, occurredAt: '2025-03-01T13:00:00.000Z', origin: 'pasada' as const };
    const { inserts } = transaction([[], [{ id: 5, ownerId: 9, isActive: true }]]);
    await openVisit(vet, past, now);
    const appt = inserts.find((i) => i.table === appointments)!.value;
    expect(appt).toMatchObject({ origin: 'pasada', status: 'en_curso', startedAt: null });
    expect(appt.scheduledAt.toISOString()).toBe('2025-03-01T13:00:00.000Z');
    expect(appt.endAt.toISOString()).toBe('2025-03-01T13:30:00.000Z');
  });
});
