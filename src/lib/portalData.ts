import { db } from '../db';
import { owners, patients } from '../db/schema/patients';
import { appointments } from '../db/schema/appointments';
import { invoices } from '../db/schema/billing';
import { prescriptions, prescriptionItems, labOrders } from '../db/schema/prescriptions';
import { patientCoOwners } from '../db/schema/co-owners';
import { users } from '../db/schema/users';
import { eq, gte, and, ne, desc, inArray, or, sql } from 'drizzle-orm';

/**
 * Datos del portal del tutor, compartidos entre el SSR del dashboard
 * (evita el round-trip cliente→servidor extra en la primera carga) y el
 * endpoint /api/client/portal (usado para refrescar tras una acción, ej.
 * agregar una mascota). Una sola fuente de verdad para no duplicar el query.
 */
export async function getPortalData(userId: string) {
  const [owner] = await db.select().from(owners).where(eq(owners.userId, userId));
  if (!owner) {
    return { owner: null, pets: [], appointments: [], invoices: [], prescriptions: [], labOrders: [] };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Mascotas donde este tutor es co-tutor (además de las que le pertenecen
  // directamente), para que una pareja/familia pueda compartir el acceso.
  const coOwnedRows = await db.select({ patientId: patientCoOwners.patientId }).from(patientCoOwners).where(eq(patientCoOwners.ownerId, owner.id));
  const coOwnedIds = coOwnedRows.map((r) => r.patientId);

  const [pets, upcomingAppts, pendingInvoices, rxList, labList] = await Promise.all([
    // Sin `photo`: esa columna puede pesar hasta ~500KB por mascota en
    // base64. La tarjeta de la lista solo muestra un emoji de especie — la
    // foto real se pide aparte en /dashboard/mascota/[id] cuando hace falta.
    db.select({
      id: patients.id,
      name: patients.name,
      species: patients.species,
      breed: patients.breed,
      color: patients.color,
      sex: patients.sex,
      dateOfBirth: patients.dateOfBirth,
      weight: patients.weight,
      microchipNumber: patients.microchipNumber,
      notes: patients.notes,
      isActive: patients.isActive,
      ownerId: patients.ownerId,
      hasPhoto: sql<boolean>`${patients.photo} IS NOT NULL`,
      createdAt: patients.createdAt,
      updatedAt: patients.updatedAt,
    }).from(patients).where(
      and(
        eq(patients.isActive, true),
        coOwnedIds.length > 0 ? or(eq(patients.ownerId, owner.id), inArray(patients.id, coOwnedIds)) : eq(patients.ownerId, owner.id),
      ),
    ),
    db
      .select({
        id: appointments.id,
        scheduledAt: appointments.scheduledAt,
        endAt: appointments.endAt,
        type: appointments.type,
        status: appointments.status,
        reason: appointments.reason,
        visitAddress: appointments.visitAddress,
        veterinarianName: users.name,
      })
      .from(appointments)
      .leftJoin(users, eq(appointments.veterinarianId, users.id))
      .where(and(eq(appointments.ownerId, owner.id), gte(appointments.scheduledAt, today)))
      .orderBy(appointments.scheduledAt)
      .limit(10),
    db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        date: invoices.date,
        total: invoices.total,
        status: invoices.status,
      })
      .from(invoices)
      .where(and(eq(invoices.ownerId, owner.id), ne(invoices.status, 'pagada')))
      .orderBy(invoices.date)
      .limit(10),
    // Recetas de las mascotas del tutor
    db
      .select({
        id: prescriptions.id,
        date: prescriptions.date,
        status: prescriptions.status,
        notes: prescriptions.notes,
        patientName: patients.name,
        veterinarianName: users.name,
      })
      .from(prescriptions)
      .innerJoin(patients, eq(prescriptions.patientId, patients.id))
      .leftJoin(users, eq(prescriptions.veterinarianId, users.id))
      .where(eq(patients.ownerId, owner.id))
      .orderBy(desc(prescriptions.date))
      .limit(20),
    // Órdenes de examen de las mascotas del tutor
    db
      .select({
        id: labOrders.id,
        type: labOrders.type,
        description: labOrders.description,
        status: labOrders.status,
        results: labOrders.results,
        requestedAt: labOrders.requestedAt,
        completedAt: labOrders.completedAt,
        patientName: patients.name,
        veterinarianName: users.name,
      })
      .from(labOrders)
      .innerJoin(patients, eq(labOrders.patientId, patients.id))
      .leftJoin(users, eq(labOrders.veterinarianId, users.id))
      .where(eq(patients.ownerId, owner.id))
      .orderBy(desc(labOrders.requestedAt))
      .limit(20),
  ]);

  // Adjuntar los medicamentos a cada receta
  let prescriptionsWithItems = rxList.map((rx) => ({ ...rx, items: [] as any[] }));
  if (rxList.length > 0) {
    const items = await db
      .select()
      .from(prescriptionItems)
      .where(inArray(prescriptionItems.prescriptionId, rxList.map((r) => r.id)));
    prescriptionsWithItems = rxList.map((rx) => ({
      ...rx,
      items: items.filter((it) => it.prescriptionId === rx.id),
    }));
  }

  return {
    owner,
    pets,
    appointments: upcomingAppts,
    invoices: pendingInvoices,
    prescriptions: prescriptionsWithItems,
    labOrders: labList,
  };
}

export type PortalData = Awaited<ReturnType<typeof getPortalData>>;
