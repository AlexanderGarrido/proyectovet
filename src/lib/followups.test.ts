import { describe, expect, it, vi } from 'vitest';
import { createVisitFollowups } from './followups';
import { followupTasks } from '../db/schema/followups';

/**
 * Inserción simulada: registra los valores y la cláusula de conflicto, que
 * es la que garantiza la deduplicación.
 */
function tx() {
  const inserts: { table: unknown; values: any[]; conflict?: unknown }[] = [];
  return {
    inserts,
    insert: (table: unknown) => ({
      values: (values: any) => ({
        onConflictDoNothing: (conflict: unknown) => {
          inserts.push({ table, values: Array.isArray(values) ? values : [values], conflict });
          return Promise.resolve();
        },
      }),
    }),
  };
}

const base = { appointmentId: 7, patientId: 3, veterinarianId: 'vet-1', aftercare: [] as string[] };

describe('Pendientes derivados del cierre de una visita', () => {
  it('una visita pagada por completo no deja pendientes', async () => {
    const t = tx();
    await createVisitFollowups(t as any, { ...base, invoiceId: 11, invoiceTotal: 25000, paidCents: 25000 });
    expect(t.inserts).toHaveLength(0);
  });

  it('un cierre con saldo deja una tarea de cobro, no una atención incompleta', async () => {
    const t = tx();
    await createVisitFollowups(t as any, { ...base, invoiceId: 11, invoiceTotal: 25000, paidCents: 10000 });
    expect(t.inserts[0].table).toBe(followupTasks);
    expect(t.inserts[0].values[0]).toMatchObject({
      kind: 'cobro_pendiente', appointmentId: 7, patientId: 3, assignedTo: 'vet-1',
      sourceKey: 'visit:7:cobro',
    });
  });

  it('las indicaciones de la prestación generan seguimiento con su propia clave', async () => {
    const t = tx();
    await createVisitFollowups(t as any, { ...base, invoiceId: null, invoiceTotal: 0, paidCents: 0, aftercare: ['Controlar temperatura 48 h'] });
    expect(t.inserts[0].values).toHaveLength(1);
    expect(t.inserts[0].values[0]).toMatchObject({ kind: 'seguimiento', sourceKey: 'visit:7:seguimiento' });
    expect(t.inserts[0].values[0].detail).toContain('Controlar temperatura');
  });

  it('reprocesar el mismo cierre no puede duplicar: la clave de origen resuelve el conflicto', async () => {
    const t = tx();
    const context = { ...base, invoiceId: 11, invoiceTotal: 25000, paidCents: 0, aftercare: ['Reposo'] };
    await createVisitFollowups(t as any, context);
    await createVisitFollowups(t as any, context);
    const keys = t.inserts.flatMap((i) => i.values.map((v: any) => v.sourceKey));
    expect(keys).toEqual(['visit:7:cobro', 'visit:7:seguimiento', 'visit:7:cobro', 'visit:7:seguimiento']);
    // Las dos llamadas usan la misma clave y declaran el conflicto: la
    // base descarta la segunda en vez de crear una tarea repetida.
    for (const insert of t.inserts) expect(insert.conflict).toEqual({ target: followupTasks.sourceKey });
  });

  it('solo recorta las indicaciones al detalle, sin inventar una lectura clínica', async () => {
    const t = tx();
    const muchas = Array.from({ length: 8 }, (_, i) => `Indicación ${i + 1}`);
    await createVisitFollowups(t as any, { ...base, invoiceId: null, invoiceTotal: 0, paidCents: 0, aftercare: muchas });
    expect(t.inserts[0].values[0].detail.split('\n')).toHaveLength(5);
  });
});
