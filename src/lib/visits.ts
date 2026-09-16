import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { db } from '../db';
import { appointments } from '../db/schema/appointments';
import { patients, owners } from '../db/schema/patients';
import { users } from '../db/schema/users';
import { medicalRecords, vaccines } from '../db/schema/medical';
import { invoices, payments } from '../db/schema/billing';
import { products, stockLocations, stockByLocation } from '../db/schema/inventory';
import { clinicDay, clinicDayRange } from './clinic-time';
import type { DaySnapshot, VisitSnapshot } from './visit-types';

export interface VisitUser { id: string; name: string; role: string; }
export const isVisitStaff = (role: string) => ['admin', 'veterinario', 'recepcionista'].includes(role);
export const canAccessVisit = (user: VisitUser, veterinarianId: string) => isVisitStaff(user.role) && (user.role !== 'veterinario' || user.id === veterinarianId);

export async function loadDay(user: VisitUser, day = clinicDay(), visitId?: number): Promise<DaySnapshot> {
  const { start, end } = clinicDayRange(day);
  const rows = await db.select({
    appointment: appointments,
    patient: { name: patients.name, species: patients.species, breed: patients.breed, weight: patients.weight, notes: patients.notes },
    owner: { firstName: owners.firstName, lastName: owners.lastName, phone: owners.phone, address: owners.address },
    veterinarianName: users.name,
  }).from(appointments)
    .innerJoin(patients, eq(appointments.patientId, patients.id))
    .innerJoin(owners, eq(appointments.ownerId, owners.id))
    .innerJoin(users, eq(appointments.veterinarianId, users.id))
    .where(and(
      visitId ? eq(appointments.id, visitId) : and(gte(appointments.scheduledAt, start), lt(appointments.scheduledAt, end)),
      user.role === 'veterinario' ? eq(appointments.veterinarianId, user.id) : undefined,
    )).orderBy(asc(appointments.scheduledAt)).limit(150);
  const patientIds = [...new Set(rows.map((r) => r.appointment.patientId))];
  const visitIds = rows.map((r) => r.appointment.id);
  const canReadClinical = user.role === 'admin' || user.role === 'veterinario';
  const [records, vaccineRows, invoiceRows, productRows, locations] = await Promise.all([
    patientIds.length && canReadClinical ? db.select().from(medicalRecords).where(inArray(medicalRecords.patientId, patientIds)).orderBy(desc(medicalRecords.date)).limit(1500) : [],
    patientIds.length ? db.select().from(vaccines).where(inArray(vaccines.patientId, patientIds)).orderBy(desc(vaccines.applicationDate)).limit(1500) : [],
    visitIds.length ? db.select().from(invoices).where(inArray(invoices.appointmentId, visitIds)) : [],
    db.select({ id: products.id, name: products.name, stock: sql<string>`GREATEST(0, ${products.stock} - (SELECT COALESCE(SUM(s.stock), 0) FROM stock_by_location s WHERE s.product_id = ${products.id}))::text`, unit: products.unit }).from(products).where(eq(products.isActive, true)).orderBy(asc(products.name)).limit(500),
    db.select().from(stockLocations).where(and(eq(stockLocations.isActive, true), user.role === 'veterinario' ? eq(stockLocations.assignedVetId, user.id) : undefined)),
  ]);
  const [paymentRows, stockRows] = await Promise.all([
    invoiceRows.length ? db.select().from(payments).where(inArray(payments.invoiceId, invoiceRows.map((i) => i.id))) : [],
    locations.length ? db.select().from(stockByLocation).where(inArray(stockByLocation.locationId, locations.map((l) => l.id))) : [],
  ]);
  const visits = rows.map(({ appointment, ...rest }) => ({
    ...appointment, ...rest,
    records: records.filter((r) => r.patientId === appointment.patientId).slice(0, 20),
    vaccines: vaccineRows.filter((v) => v.patientId === appointment.patientId).slice(0, 20),
    invoices: invoiceRows.filter((i) => i.appointmentId === appointment.id).map((i) => ({
      id: i.id, total: i.total, status: i.status, invoiceNumber: i.invoiceNumber,
      paid: paymentRows.filter((p) => p.invoiceId === i.id).reduce((sum, p) => sum + Number(p.amount), 0),
    })),
  }));
  return JSON.parse(JSON.stringify({
    userId: user.id, userName: user.name, role: user.role, day, preparedAt: new Date().toISOString(), visits, products: productRows,
    locations: locations.map((l) => ({ id: l.id, name: l.name, assignedVetId: l.assignedVetId, stocks: stockRows.filter((s) => s.locationId === l.id).map((s) => ({ productId: s.productId, stock: s.stock })) })),
  })) as DaySnapshot;
}

export function activeVisits(visits: VisitSnapshot[]) {
  return visits.filter((v) => !['cancelada', 'no_asistio', 'completada'].includes(v.status));
}
