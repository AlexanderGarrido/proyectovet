import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../src/db';
import { appointments } from '../../src/db/schema/appointments';
import { products, stockMovements } from '../../src/db/schema/inventory';
import { invoices } from '../../src/db/schema/billing';
import { openVisit } from '../../src/lib/open-visit';
import { saveVisit } from '../../src/lib/save-visit';
import { cleanupTestData, createFixtures } from './fixtures';

// La conexión solo se abre al primer query, así que importar src/db sin
// TEST_DATABASE_URL es inocuo: el describe se salta y nunca se consulta.
describe.skipIf(!process.env.TEST_DATABASE_URL)('atención sin cita contra Postgres real', () => {
  let f: Awaited<ReturnType<typeof createFixtures>>;

  beforeAll(async () => {
    await cleanupTestData();
    f = await createFixtures();
  });
  afterAll(async () => { await cleanupTestData(); });

  it('abre, guarda con prestación y pago, y cierra: cita, factura y stock quedan correctos', async () => {
    const open = { id: randomUUID(), patientId: f.patient.id, occurredAt: new Date(Date.now() - 60_000).toISOString() };
    const opened = await openVisit(f.vet, open);
    const [appt] = await db.select().from(appointments).where(eq(appointments.id, opened.visitId));
    expect(appt).toMatchObject({ origin: 'sin_cita', status: 'en_curso', veterinarianId: f.vet.id });

    // Encadenado a la apertura, como lo envía la cola del teléfono.
    const saved = await saveVisit(f.vet, {
      id: randomUUID(), visitId: opened.visitId, expectedUpdatedAt: opened.updatedAt, predecessorId: open.id, action: 'save', version: 2,
      record: { reason: 'Control sin cita' }, items: [{ serviceId: f.service.id, quantity: 1 }], payment: { amount: 20000, method: 'efectivo' },
    });
    expect(saved.invoiceId).toBeTruthy();

    const done = await saveVisit(f.vet, { id: randomUUID(), visitId: opened.visitId, expectedUpdatedAt: saved.updatedAt, action: 'complete' });
    expect(done.status).toBe('completada');

    const [product] = await db.select().from(products).where(eq(products.id, f.product.id));
    expect(Number(product.stock)).toBe(9);
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, saved.invoiceId!));
    expect(invoice.status).toBe('pagada');
    const [closed] = await db.select().from(appointments).where(eq(appointments.id, opened.visitId));
    expect(closed.endAt.getTime()).toBeGreaterThan(closed.scheduledAt.getTime());
  });

  it('reintentar la apertura y el guardado no duplica nada', async () => {
    const open = { id: randomUUID(), patientId: f.patient.id, occurredAt: new Date().toISOString() };
    const a = await openVisit(f.vet, open);
    const b = await openVisit(f.vet, open);
    expect(b.visitId).toBe(a.visitId);
    const save = {
      id: randomUUID(), visitId: a.visitId, expectedUpdatedAt: a.updatedAt, predecessorId: open.id, action: 'save' as const, version: 2,
      record: { reason: 'Reintento' }, items: [{ serviceId: f.service.id, quantity: 1 }],
    };
    const first = await saveVisit(f.vet, save);
    const again = await saveVisit(f.vet, save);
    expect(again).toEqual(first);
    const movements = await db.select().from(stockMovements).where(eq(stockMovements.referenceId, first.recordId!));
    expect(movements).toHaveLength(1);
  });

  it('agendar una cita que se solapa con una atención sin cita responde 409', async () => {
    const opened = await openVisit(f.vet, { id: randomUUID(), patientId: f.patient.id, occurredAt: new Date().toISOString() });
    expect(opened.visitId).toBeGreaterThan(0);
    const { POST } = await import('../../src/pages/api/appointments/index');
    const res = await POST({
      locals: { user: f.vet },
      request: new Request('http://localhost/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          patientId: f.patient.id, ownerId: f.owner.id, veterinarianId: f.vet.id, type: 'consulta',
          scheduledAt: new Date(Date.now() + 5 * 60_000).toISOString(), endAt: new Date(Date.now() + 35 * 60_000).toISOString(),
        }),
      }),
    } as any);
    // Si falla con "Received an instance of Date", volvió la regresión de 70277b4.
    expect(res.status).toBe(409);
  });
});
