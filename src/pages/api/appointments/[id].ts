import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { appointments } from '../../../db/schema/appointments';
import { patients, owners } from '../../../db/schema/patients';
import { users } from '../../../db/schema/users';
import { eq, and, ne, lt, gt, notInArray, sql } from 'drizzle-orm';
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
  if (user!.role === 'veterinario' && appt.veterinarianId !== user!.id) return jsonError(403, 'Sin permiso');

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

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(764210)`);
    const [existing] = await tx.select().from(appointments).where(eq(appointments.id, id));
    if (!existing) return jsonError(404, 'No encontrado');
    if (user!.role === 'veterinario' && (existing.veterinarianId !== user!.id || (veterinarianId && veterinarianId !== user!.id))) return jsonError(403, 'Sin permiso');
    const start = scheduledAt ? new Date(scheduledAt) : existing.scheduledAt;
    const end = endAt ? new Date(endAt) : existing.endAt;
    if (end <= start) return jsonError(400, 'La hora de fin debe ser posterior a la de inicio');
    const vetId = veterinarianId ?? existing.veterinarianId;
    const [vet] = await tx.select().from(users).where(eq(users.id, vetId));
    if (!vet || !vet.isActive || vet.role !== 'veterinario') return jsonError(400, 'Veterinario inválido');
    if (!['cancelada', 'no_asistio'].includes(status ?? existing.status)) {
      const [overlap] = await tx.select({ id: appointments.id }).from(appointments).where(and(
        ne(appointments.id, id), eq(appointments.veterinarianId, vetId),
        notInArray(appointments.status, ['cancelada', 'no_asistio']),
        lt(appointments.scheduledAt, end), gt(appointments.endAt, start),
      ));
      if (overlap) return jsonError(409, 'El veterinario ya tiene una cita en ese horario');
    }
    const [updated] = await tx.update(appointments).set({
      scheduledAt: start, endAt: end, type, status, reason, notes, veterinarianId,
      ...(visitAddress !== undefined && { visitAddress }),
    }).where(eq(appointments.id, id)).returning();
    return jsonOk(updated);
  });
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
  const [existing] = await db.select().from(appointments).where(eq(appointments.id, id));
  if (!existing) return jsonError(404, 'No encontrado');
  if (user!.role === 'veterinario' && existing.veterinarianId !== user!.id) return jsonError(403, 'Sin permiso');
  await db.update(appointments).set({ status: 'cancelada' }).where(eq(appointments.id, id));
  return jsonOk({ success: true });
};
