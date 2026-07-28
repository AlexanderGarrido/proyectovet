import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { appointments } from '../../../db/schema/appointments';
import { patients, owners } from '../../../db/schema/patients';
import { users } from '../../../db/schema/users';
import { eq } from 'drizzle-orm';
import { appointmentUpdateSchema, zodError, parseJsonBody } from '../../../lib/schemas';
import { requirePermission } from '../../../lib/guard';
import { jsonError, jsonOk } from '../../../lib/http';

export const GET: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'appointments', 'read');
  if (guardErr) return guardErr;

  const id = Number(params.id);
  if (!id || isNaN(id) || id <= 0) {
    return jsonError(400, 'ID inválido');
  }
  const [appt] = await db
    .select({
      id: appointments.id,
      scheduledAt: appointments.scheduledAt,
      endAt: appointments.endAt,
      type: appointments.type,
      status: appointments.status,
      reason: appointments.reason,
      notes: appointments.notes,
      visitAddress: appointments.visitAddress,
      patientId: appointments.patientId,
      patientName: patients.name,
      patientSpecies: patients.species,
      ownerId: appointments.ownerId,
      ownerFirstName: owners.firstName,
      ownerLastName: owners.lastName,
      ownerPhone: owners.phone,
      veterinarianId: appointments.veterinarianId,
      veterinarianName: users.name,
    })
    .from(appointments)
    .leftJoin(patients, eq(appointments.patientId, patients.id))
    .leftJoin(owners, eq(appointments.ownerId, owners.id))
    .leftJoin(users, eq(appointments.veterinarianId, users.id))
    .where(eq(appointments.id, id));

  if (!appt) return jsonError(404, 'No encontrado');

  // SEGURIDAD (IDOR): un tutor solo puede ver el detalle de sus propias citas.
  if (user!.role === 'tutor') {
    const [owner] = await db.select({ id: owners.id }).from(owners).where(eq(owners.userId, user!.id));
    if (!owner || appt.ownerId !== owner.id) return jsonError(404, 'No encontrado');
  }

  return jsonOk(appt);
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  // SEGURIDAD (IDOR): antes solo exigía sesión — cualquier tutor podía
  // reasignar veterinario, cambiar dirección o estado de cualquier cita.
  const guardErr = requirePermission(user, 'appointments', 'write');
  if (guardErr) return guardErr;

  const id = Number(params.id);
  if (!id || isNaN(id) || id <= 0) {
    return jsonError(400, 'ID inválido');
  }
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const result = appointmentUpdateSchema.safeParse(parsed.data);
  if (!result.success) return zodError(result.error);
  const { scheduledAt, endAt, type, status, reason, notes, veterinarianId, visitAddress } = result.data;

  await db.update(appointments).set({
    scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    endAt: endAt ? new Date(endAt) : undefined,
    type, status, reason, notes, veterinarianId,
    ...(visitAddress !== undefined && { visitAddress }),
  }).where(eq(appointments.id, id));

  const [updated] = await db.select().from(appointments).where(eq(appointments.id, id));
  return jsonOk(updated);
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  // SEGURIDAD (IDOR): antes solo exigía sesión — cualquier tutor podía
  // cancelar cualquier cita de la clínica.
  const guardErr = requirePermission(user, 'appointments', 'write');
  if (guardErr) return guardErr;

  const id = Number(params.id);
  if (!id || isNaN(id) || id <= 0) {
    return jsonError(400, 'ID inválido');
  }
  await db.update(appointments).set({ status: 'cancelada' }).where(eq(appointments.id, id));
  return jsonOk({ success: true });
};
