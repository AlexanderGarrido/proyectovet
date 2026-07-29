import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { patients, owners } from '../../../db/schema/patients';
import { medicalRecords, vaccines } from '../../../db/schema/medical';
import { appointments } from '../../../db/schema/appointments';
import { eq, desc } from 'drizzle-orm';
import { patientUpdateSchema, zodError, parseJsonBody } from '../../../lib/schemas';
import { logAudit } from '../../../lib/audit';
import { requirePermission, requireUnscopedPermission } from '../../../lib/guard';

// SEGURIDAD (IDOR): antes solo exigía sesión — cualquier tutor autenticado
// podía leer/modificar/desactivar la ficha de CUALQUIER paciente (ficha
// completa, foto, notas) cambiando el id en la URL. No hay ningún flujo de
// UI para tutores contra este endpoint (usan /api/client/pets); el propio
// PatientForm.tsx de staff es el único llamador real. requireUnscopedPermission
// rechaza a tutor por completo en vez de dejarlo pasar por la variante ":own".

export const GET: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  const guardErr = requireUnscopedPermission(user, 'patients', 'read');
  if (guardErr) return guardErr;

  const id = Number(params.id);
  if (!id || isNaN(id) || id <= 0) {
    return new Response(JSON.stringify({ error: 'ID inválido' }), { status: 400 });
  }
  const [patient] = await db
    .select({
      id: patients.id,
      name: patients.name,
      species: patients.species,
      breed: patients.breed,
      color: patients.color,
      sex: patients.sex,
      dateOfBirth: patients.dateOfBirth,
      weight: patients.weight,
      microchipNumber: patients.microchipNumber,
      photo: patients.photo,
      notes: patients.notes,
      isActive: patients.isActive,
      ownerId: patients.ownerId,
      ownerFirstName: owners.firstName,
      ownerLastName: owners.lastName,
      ownerEmail: owners.email,
      ownerPhone: owners.phone,
    })
    .from(patients)
    .leftJoin(owners, eq(patients.ownerId, owners.id))
    .where(eq(patients.id, id));

  if (!patient) return new Response(JSON.stringify({ error: 'No encontrado' }), { status: 404 });

  const records = await db.select().from(medicalRecords).where(eq(medicalRecords.patientId, id)).orderBy(desc(medicalRecords.date)).limit(5);
  const patientVaccines = await db.select().from(vaccines).where(eq(vaccines.patientId, id)).orderBy(desc(vaccines.applicationDate));
  const patientAppointments = await db.select().from(appointments).where(eq(appointments.patientId, id)).orderBy(desc(appointments.scheduledAt)).limit(5);

  return new Response(JSON.stringify({ ...patient, medicalRecords: records, vaccines: patientVaccines, appointments: patientAppointments }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'patients', 'write');
  if (guardErr) return guardErr;

  const id = Number(params.id);
  if (!id || isNaN(id) || id <= 0) {
    return new Response(JSON.stringify({ error: 'ID inválido' }), { status: 400 });
  }
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const result = patientUpdateSchema.safeParse(parsed.data);
  if (!result.success) return zodError(result.error);
  const { name, species, breed, color, sex, dateOfBirth, weight, microchipNumber, notes, isActive, photo } = result.data;

  await db.update(patients).set({ name, species, breed, color, sex, dateOfBirth: dateOfBirth || null, weight: weight || null, microchipNumber, notes, isActive, photo: photo ?? undefined }).where(eq(patients.id, id));
  const [updated] = await db.select().from(patients).where(eq(patients.id, id));
  return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  if (user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Sin permiso' }), { status: 403 });
  }

  const id = Number(params.id);
  if (!id || isNaN(id) || id <= 0) {
    return new Response(JSON.stringify({ error: 'ID inválido' }), { status: 400 });
  }
  const [before] = await db.select({ name: patients.name }).from(patients).where(eq(patients.id, id));
  await db.update(patients).set({ isActive: false }).where(eq(patients.id, id));
  await logAudit({
    userId: user.id, userName: user.name, action: 'patient.deactivate',
    entityType: 'patient', entityId: id, metadata: { name: before?.name },
  });
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
};
