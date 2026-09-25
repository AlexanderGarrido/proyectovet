import { randomUUID } from 'node:crypto';
import { eq, inArray, like } from 'drizzle-orm';
import { db } from '../../src/db';
import { users } from '../../src/db/schema/users';
import { owners, patients } from '../../src/db/schema/patients';
import { products, stockMovements } from '../../src/db/schema/inventory';
import { services, serviceComponents, visitServiceItems } from '../../src/db/schema/services';
import { appointments } from '../../src/db/schema/appointments';
import { invoices, invoiceItems, payments } from '../../src/db/schema/billing';
import { medicalRecords } from '../../src/db/schema/medical';
import { visitOperations } from '../../src/db/schema/visit-operations';
import { followupTasks } from '../../src/db/schema/followups';

export const TEST_MARK = '[TEST]';
const TEST_EMAIL_DOMAIN = '@alma-test.invalid';

/** Crea un veterinario, un responsable, un paciente, un producto con stock y una prestación que lo consume. */
export async function createFixtures() {
  const vetId = randomUUID();
  await db.insert(users).values({ id: vetId, name: `${TEST_MARK} Vet`, email: `vet-${vetId}${TEST_EMAIL_DOMAIN}`, role: 'veterinario' });
  const [owner] = await db.insert(owners).values({ firstName: TEST_MARK, lastName: 'Responsable' }).returning();
  const [patient] = await db.insert(patients).values({ ownerId: owner.id, name: `${TEST_MARK} Toby`, species: 'perro', sex: 'macho' }).returning();
  const [product] = await db.insert(products).values({ name: `${TEST_MARK} Jeringa`, category: 'insumo', unitPrice: '100', stock: '10' }).returning();
  const [service] = await db.insert(services).values({ name: `${TEST_MARK} Consulta`, price: '20000' }).returning();
  await db.insert(serviceComponents).values({ serviceId: service.id, productId: product.id, quantity: '1' });
  return { vet: { id: vetId, name: `${TEST_MARK} Vet`, role: 'veterinario' }, owner, patient, product, service };
}

/**
 * Borra todo lo marcado [TEST], en orden de dependencias. Se usa en afterAll
 * y en `npm run test:integration:limpiar`, por si una prueba se cortó. Nunca
 * toca filas sin la marca.
 */
export async function cleanupTestData() {
  const testUsers = (await db.select({ id: users.id }).from(users).where(like(users.email, `%${TEST_EMAIL_DOMAIN}`))).map((u) => u.id);
  const testOwners = (await db.select({ id: owners.id }).from(owners).where(eq(owners.firstName, TEST_MARK))).map((o) => o.id);
  const testPatients = testOwners.length ? (await db.select({ id: patients.id }).from(patients).where(inArray(patients.ownerId, testOwners))).map((p) => p.id) : [];
  const testProducts = (await db.select({ id: products.id }).from(products).where(like(products.name, `${TEST_MARK}%`))).map((p) => p.id);
  const testServices = (await db.select({ id: services.id }).from(services).where(like(services.name, `${TEST_MARK}%`))).map((s) => s.id);
  const testAppointments = testPatients.length ? (await db.select({ id: appointments.id }).from(appointments).where(inArray(appointments.patientId, testPatients))).map((a) => a.id) : [];
  const testInvoices = testOwners.length ? (await db.select({ id: invoices.id }).from(invoices).where(inArray(invoices.ownerId, testOwners))).map((i) => i.id) : [];

  if (testProducts.length) await db.delete(stockMovements).where(inArray(stockMovements.productId, testProducts));
  if (testPatients.length) await db.delete(followupTasks).where(inArray(followupTasks.patientId, testPatients));
  if (testAppointments.length) await db.delete(visitServiceItems).where(inArray(visitServiceItems.appointmentId, testAppointments));
  if (testInvoices.length) {
    await db.delete(payments).where(inArray(payments.invoiceId, testInvoices));
    await db.delete(invoiceItems).where(inArray(invoiceItems.invoiceId, testInvoices));
    await db.delete(invoices).where(inArray(invoices.id, testInvoices));
  }
  if (testPatients.length) await db.delete(medicalRecords).where(inArray(medicalRecords.patientId, testPatients));
  if (testAppointments.length) await db.delete(appointments).where(inArray(appointments.id, testAppointments));
  if (testUsers.length) await db.delete(visitOperations).where(inArray(visitOperations.userId, testUsers));
  if (testServices.length) await db.delete(services).where(inArray(services.id, testServices));
  if (testProducts.length) await db.delete(products).where(inArray(products.id, testProducts));
  if (testPatients.length) await db.delete(patients).where(inArray(patients.id, testPatients));
  if (testOwners.length) await db.delete(owners).where(inArray(owners.id, testOwners));
  if (testUsers.length) await db.delete(users).where(inArray(users.id, testUsers));
}
