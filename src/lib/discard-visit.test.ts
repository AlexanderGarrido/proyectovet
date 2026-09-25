import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appointments } from '../db/schema/appointments';

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('../db', () => ({ db: { transaction: mocks.transaction } }));
import { discardVisit } from './discard-visit';

const vet = { id: 'vet-1', name: 'Vet', role: 'veterinario' };
const walkIn = { id: 41, veterinarianId: 'vet-1', origin: 'sin_cita', status: 'en_curso' };

// Lecturas en orden: la cita (bloqueada), su nota, su cobro.
function transaction(reads: unknown[][]) {
  const deletes: unknown[] = [];
  const chain = (result: () => unknown): any => {
    const q: any = {};
    for (const m of ['where', 'for', 'limit']) q[m] = () => q;
    q.then = (res: any, rej: any) => Promise.resolve().then(result).then(res, rej);
    return q;
  };
  const tx = {
    select: vi.fn(() => ({ from: () => chain(() => reads.shift() ?? []) })),
    delete: vi.fn((table) => ({ where: () => chain(() => { deletes.push(table); return []; }) })),
  };
  mocks.transaction.mockImplementation(async (cb) => cb(tx));
  return { deletes };
}

beforeEach(() => vi.clearAllMocks());

describe('discardVisit', () => {
  it('borra una atención sin cita que todavía no tiene nota ni cobro', async () => {
    const { deletes } = transaction([[walkIn], [], []]);
    await expect(discardVisit(vet, 41)).resolves.toEqual({ discarded: 41 });
    expect(deletes).toEqual([appointments]);
  });

  it('también una consulta pasada abierta por error', async () => {
    const { deletes } = transaction([[{ ...walkIn, origin: 'pasada' }], [], []]);
    await discardVisit(vet, 41);
    expect(deletes).toEqual([appointments]);
  });

  it('recepción no puede descartar', async () => {
    await expect(discardVisit({ ...vet, role: 'recepcionista' }, 41)).rejects.toMatchObject({ status: 403 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['no existe', [[]], 404],
    ['es de otro veterinario', [[{ ...walkIn, veterinarianId: 'otro' }]], 404],
    ['es una cita agendada', [[{ ...walkIn, origin: 'agendada' }]], 409],
    ['ya está cerrada', [[{ ...walkIn, status: 'completada' }]], 409],
    ['ya tiene nota', [[walkIn], [{ id: 3 }]], 409],
    ['ya tiene cobro', [[walkIn], [], [{ id: 4 }]], 409],
  ] as const)('no borra si %s', async (_case, reads, status) => {
    const { deletes } = transaction(reads.map((r) => [...r]));
    await expect(discardVisit(vet, 41)).rejects.toMatchObject({ status });
    expect(deletes).toEqual([]);
  });
});
