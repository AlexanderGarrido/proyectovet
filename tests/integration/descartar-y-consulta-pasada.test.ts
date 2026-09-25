import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../src/db';
import { appointments } from '../../src/db/schema/appointments';
import { medicalRecords } from '../../src/db/schema/medical';
import { openVisit } from '../../src/lib/open-visit';
import { saveVisit } from '../../src/lib/save-visit';
import { discardVisit } from '../../src/lib/discard-visit';
import { cleanupTestData, createFixtures } from './fixtures';

describe.skipIf(!process.env.TEST_DATABASE_URL)('descartar y consulta pasada contra Postgres real', () => {
  let f: Awaited<ReturnType<typeof createFixtures>>;

  beforeAll(async () => {
    await cleanupTestData();
    f = await createFixtures();
  });
  afterAll(async () => { await cleanupTestData(); });

  it('descarta una atención sin cita vacía: la cita desaparece', async () => {
    const opened = await openVisit(f.vet, { id: randomUUID(), patientId: f.patient.id, occurredAt: new Date().toISOString() });
    await expect(discardVisit(f.vet, opened.visitId)).resolves.toEqual({ discarded: opened.visitId });
    expect(await db.select().from(appointments).where(eq(appointments.id, opened.visitId))).toEqual([]);
  });

  it('no descarta una atención que ya tiene nota', async () => {
    const open = { id: randomUUID(), patientId: f.patient.id, occurredAt: new Date().toISOString() };
    const opened = await openVisit(f.vet, open);
    await saveVisit(f.vet, { id: randomUUID(), visitId: opened.visitId, expectedUpdatedAt: opened.updatedAt, predecessorId: open.id, action: 'save', record: { reason: 'Con nota' } });
    await expect(discardVisit(f.vet, opened.visitId)).rejects.toMatchObject({ status: 409 });
    expect(await db.select().from(appointments).where(eq(appointments.id, opened.visitId))).toHaveLength(1);
  });

  it('consulta pasada: la nota toma la fecha elegida y cerrar no mueve el fin', async () => {
    const when = '2025-03-01T13:00:00.000Z';
    const open = { id: randomUUID(), patientId: f.patient.id, occurredAt: when, origin: 'pasada' as const };
    const opened = await openVisit(f.vet, open);
    const saved = await saveVisit(f.vet, {
      id: randomUUID(), visitId: opened.visitId, expectedUpdatedAt: opened.updatedAt, predecessorId: open.id, action: 'save',
      record: { reason: 'Consulta en papel' }, noCharge: true,
    });
    await saveVisit(f.vet, { id: randomUUID(), visitId: opened.visitId, expectedUpdatedAt: saved.updatedAt, action: 'complete', noCharge: true });
    const [record] = await db.select().from(medicalRecords).where(eq(medicalRecords.appointmentId, opened.visitId));
    expect(record.date.toISOString()).toBe(when);
    const [appt] = await db.select().from(appointments).where(eq(appointments.id, opened.visitId));
    expect(appt).toMatchObject({ origin: 'pasada', status: 'completada', startedAt: null });
    expect(appt.endAt.toISOString()).toBe('2025-03-01T13:30:00.000Z');
  });
});
