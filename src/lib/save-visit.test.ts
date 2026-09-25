import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appointments } from '../db/schema/appointments';
import { medicalRecords } from '../db/schema/medical';
import { payments, invoices } from '../db/schema/billing';
import { products, stockMovements } from '../db/schema/inventory';
import { visitOperations } from '../db/schema/visit-operations';
import { visitServiceItems } from '../db/schema/services';
import { followupTasks } from '../db/schema/followups';
import { invoiceItems } from '../db/schema/billing';
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
    for (const method of ['where', 'for', 'limit', 'returning', 'leftJoin', 'innerJoin', 'orderBy', 'onConflictDoNothing']) query[method] = () => query;
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
    // La última lectura son las indicaciones de las prestaciones ya
    // registradas en la cita, de donde sale el seguimiento del cierre.
    const state = transaction([[{ ...visit, updatedAt: startedAt }], [], [], [], [{ result: { visitId: 7, updatedAt: startedAt } }], []]);
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

describe('Prestaciones del catálogo en el cierre', () => {
  const servicio = { id: 5, name: 'Vacunación a domicilio', price: '18000.00', aftercare: 'Observar 48 h', isActive: true };

  it('emite un solo cobro, con el precio del servidor y su línea de prestación', async () => {
    // Lecturas: visita, comprobante, registro previo, facturas, catálogo,
    // componentes. El cliente no envía precios: los pone el catálogo.
    const state = transaction([[visit], [], [], [], [servicio], []]);
    const result = await saveVisit(user, operation({ action: 'save', record: { reason: 'Vacunación' }, items: [{ serviceId: 5, quantity: 2 }] }));

    const invoice = state.committed.find((w) => w.table === invoices);
    expect(invoice?.value).toMatchObject({ total: '36000.00', subtotal: '36000.00', status: 'emitida' });
    const lines = state.committed.filter((w) => w.table === invoiceItems);
    expect(lines).toHaveLength(1);
    expect(lines[0].value).toMatchObject({ description: 'Vacunación a domicilio', unitPrice: '18000.00', subtotal: '36000.00' });

    // La línea de prestación es la referencia única que impide volver a
    // cobrar esta atención desde el formulario general.
    const item = state.committed.find((w) => w.table === visitServiceItems);
    expect(item?.value).toMatchObject({
      appointmentId: 7, serviceId: 5, quantity: '2',
      unitPriceSnapshot: '18000.00', operationId: operation().id,
    });
    expect(result.invoiceId).toBe(19);
  });

  it('rechaza prestaciones cuando la visita ya tiene un cobro emitido', async () => {
    const state = transaction([[visit], [], [], [{ id: 4, total: '10000.00', status: 'emitida' }], [servicio], []]);
    await expect(saveVisit(user, operation({ items: [{ serviceId: 5, quantity: 1 }] }))).rejects.toThrow('ya tiene un cobro');
    expect(state.committed).toHaveLength(0);
  });

  it('exige la consulta antes de descontar los insumos de una prestación', async () => {
    // Sin nota clínica el movimiento de stock no tendría a qué referirse.
    const components = [{ serviceId: 5, productId: 10, childServiceId: null, quantity: '1', optional: false, aftercare: null }];
    const state = transaction([[visit], [], [], [], [servicio], components]);
    await expect(saveVisit(user, operation({ items: [{ serviceId: 5, quantity: 1 }] }))).rejects.toThrow('Registra la consulta');
    expect(state.committed).toHaveLength(0);
  });

  it('descuenta una sola vez un insumo declarado a mano y por la prestación', async () => {
    const components = [{ serviceId: 5, productId: 10, childServiceId: null, quantity: '1', optional: false, aftercare: null }];
    // La última lectura busca el botiquín del veterinario: sin ninguno
    // asignado, el consumo sale del stock general.
    const state = transaction([[visit], [], [], [], [servicio], components, []]);
    await saveVisit(user, operation({
      action: 'save',
      record: { reason: 'Vacunación', supplies: [{ productId: 10, quantity: 1 }] },
      items: [{ serviceId: 5, quantity: 1 }],
    }));
    const stockWrites = state.committed.filter((w) => w.table === products);
    expect(stockWrites).toHaveLength(1);
    expect(state.committed.find((w) => w.table === stockMovements)?.value.locationId).toBeNull();
  });

  it('el insumo de una prestación sale del único botiquín del veterinario', async () => {
    const components = [{ serviceId: 5, productId: 10, childServiceId: null, quantity: '1', optional: false, aftercare: null }];
    // Con un solo botiquín asignado no hay nada que adivinar: es donde el
    // insumo estaba físicamente, y descontarlo del stock general dejaría
    // el recuento del botiquín permanentemente alto.
    const state = transaction([[visit], [], [], [], [servicio], components, [{ id: 3 }], [{ id: 3, isActive: true, assignedVetId: user.id }]]);
    await saveVisit(user, operation({ action: 'save', record: { reason: 'Vacunación' }, items: [{ serviceId: 5, quantity: 1 }] }));
    expect(state.committed.find((w) => w.table === stockMovements)?.value.locationId).toBe(3);
  });

  it('con dos botiquines asignados no elige por su cuenta', async () => {
    const components = [{ serviceId: 5, productId: 10, childServiceId: null, quantity: '1', optional: false, aftercare: null }];
    const state = transaction([[visit], [], [], [], [servicio], components, [{ id: 3 }, { id: 4 }]]);
    await saveVisit(user, operation({ action: 'save', record: { reason: 'Vacunación' }, items: [{ serviceId: 5, quantity: 1 }] }));
    expect(state.committed.find((w) => w.table === stockMovements)?.value.locationId).toBeNull();
  });

  it('el cierre con saldo deja un pendiente de cobro, no una atención incompleta', async () => {
    const invoice = { id: 4, total: '20000.00', status: 'emitida' };
    // Lecturas: visita, comprobante, registro previo, facturas, los pagos
    // que el cierre consulta para saber si quedó saldo, y las indicaciones
    // de las prestaciones registradas.
    const state = transaction([[visit], [], [{ id: 3 }], [invoice], [], []]);
    await saveVisit(user, operation({ action: 'complete' }));
    const task = state.committed.find((w) => w.table === followupTasks);
    expect(task?.value[0]).toMatchObject({ kind: 'cobro_pendiente', sourceKey: 'visit:7:cobro' });
  });

  it('conserva el seguimiento cuando el cierre llega después del cobro', async () => {
    // Flujo habitual en dos pasos: primero se guarda con la prestación (que
    // emite el cobro), después se cierra. La operación de cierre ya no trae
    // prestaciones, así que las indicaciones se leen de lo registrado.
    const invoice = { id: 4, total: '18000.00', status: 'pagada' };
    const state = transaction([
      [visit], [], [{ id: 3 }], [invoice],
      [{ amount: '18000.00' }],
      [{ aftercare: 'Observar el sitio de aplicación 48 h' }],
    ]);
    await saveVisit(user, operation({ action: 'complete' }));
    const task = state.committed.find((w) => w.table === followupTasks);
    expect(task?.value[0]).toMatchObject({ kind: 'seguimiento', sourceKey: 'visit:7:seguimiento' });
  });

  it('no deja marcar sin costo una visita que ya tiene cobro emitido', async () => {
    const state = transaction([[visit], [], [], [{ id: 4, total: '10000.00', status: 'emitida' }]]);
    await expect(saveVisit(user, operation({ action: 'save', noCharge: true, payment: undefined })))
      .rejects.toThrow('ya tiene un cobro emitido');
    expect(state.committed).toHaveLength(0);
  });

  it('una segunda nota sobre la misma cita queda enlazada como adenda', async () => {
    const state = transaction([[visit], [], [{ id: 3 }], []]);
    await saveVisit(user, operation({ action: 'save', record: { reason: 'Corrección de la nota' } }));
    expect(state.committed.find((w) => w.table === medicalRecords)?.value.amendsRecordId).toBe(3);
  });

  it('registra la hora declarada por el dispositivo junto a la del servidor', async () => {
    const occurredAt = '2026-09-16T09:00:00.000Z';
    const state = transaction([[visit], [], [], []]);
    const result = await saveVisit(user, operation({ action: 'save', occurredAt, charge: { description: 'Atención', amount: 1000 } }));
    const receipt = state.committed.find((w) => w.table === visitOperations);
    expect(receipt?.value.occurredAt).toEqual(new Date(occurredAt));
    expect(receipt?.value.receivedAt).toBeInstanceOf(Date);
    expect(result.receivedAt).toBeTruthy();
  });
});

describe('Adenda sobre una visita cerrada', () => {
  const cerrada = { ...visit, status: 'completada' };

  it('guarda un registro nuevo enlazado al original, sin tocar la nota anterior', async () => {
    // Lecturas: visita, comprobante, registro previo, facturas y la
    // comprobación de que el registro corregido es de esta visita.
    const state = transaction([[cerrada], [], [{ id: 3 }], [], [{ id: 3 }]]);
    await saveVisit(user, operation({ action: 'save', record: { reason: 'Adenda', observations: 'Se corrige la dosis', amendsRecordId: 3 } }));
    const saved = state.committed.filter((w) => w.table === medicalRecords);
    expect(saved).toHaveLength(1);
    expect(saved[0].kind).toBe('insert');
    expect(saved[0].value.amendsRecordId).toBe(3);
  });

  it('rechaza una adenda que apunta a la nota de otra visita', async () => {
    const state = transaction([[cerrada], [], [{ id: 3 }], [], []]);
    await expect(saveVisit(user, operation({ action: 'save', record: { reason: 'Adenda', observations: 'x', amendsRecordId: 99 } })))
      .rejects.toThrow('no pertenece a esta visita');
    expect(state.committed).toHaveLength(0);
  });
});

describe('cierre de una atención sin cita', () => {
  const invoice = { id: 4, total: '18000.00', status: 'pagada' };
  const reads = (extra: object) => [[{ ...visit, ...extra }], [], [{ id: 3 }], [invoice], [{ amount: '18000.00' }], []];

  it('sin_cita: endAt pasa a la hora real del cierre', async () => {
    const state = transaction(reads({ origin: 'sin_cita', scheduledAt: new Date('2026-09-16T11:00:00.000Z') }));
    const before = Date.now();
    await saveVisit(user, operation({ action: 'complete' }));
    const update = state.committed.find((w) => w.table === appointments && w.kind === 'update')!.value;
    expect(update.endAt).toBeInstanceOf(Date);
    expect(update.endAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('agendada: endAt no se toca', async () => {
    const state = transaction(reads({ origin: 'agendada' }));
    await saveVisit(user, operation({ action: 'complete' }));
    const update = state.committed.find((w) => w.table === appointments && w.kind === 'update')!.value;
    expect(update).not.toHaveProperty('endAt');
  });
});
