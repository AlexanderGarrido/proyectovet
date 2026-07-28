import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { appointments } from '../../../db/schema/appointments';
import { patients, owners } from '../../../db/schema/patients';
import { users } from '../../../db/schema/users';
import { eq, gte, lte, and, desc } from 'drizzle-orm';
import { appointmentSchema, zodError } from '../../../lib/schemas';
import { requirePermission } from '../../../lib/guard';
import { jsonError, jsonOk } from '../../../lib/http';

export const GET: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'appointments', 'read');
  if (guardErr) return guardErr;

  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const status = url.searchParams.get('status');
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || '100')));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (from) conditions.push(gte(appointments.scheduledAt, new Date(from)));
  if (to) conditions.push(lte(appointments.scheduledAt, new Date(to)));
  const VALID_STATUSES = ['programada', 'confirmada', 'en_camino', 'en_curso', 'completada', 'cancelada', 'no_asistio'] as const;
  type AppointmentStatus = typeof VALID_STATUSES[number];
  if (status) {
    if (!VALID_STATUSES.includes(status as AppointmentStatus)) {
      return jsonError(400, 'Estado inválido');
    }
    conditions.push(eq(appointments.status, status as AppointmentStatus));
  }

  // SEGURIDAD (IDOR): un tutor solo puede ver las citas de su propia ficha
  // de tutor — nunca las de otros. Sin este filtro, cualquier tutor podía
  // listar todas las citas de la clínica (nombres, teléfonos, notas de otros).
  if (user!.role === 'tutor') {
    const [owner] = await db.select({ id: owners.id }).from(owners).where(eq(owners.userId, user!.id));
    if (!owner) return jsonOk([]);
    conditions.push(eq(appointments.ownerId, owner.id));
  }

  const result = await db
    .select({
      id: appointments.id,
      scheduledAt: appointments.scheduledAt,
      endAt: appointments.endAt,
      type: appointments.type,
      status: appointments.status,
      reason: appointments.reason,
      notes: appointments.notes,
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
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(appointments.scheduledAt))
    .limit(limit)
    .offset(offset);

  return jsonOk(result);
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'appointments', 'write');
  if (guardErr) return guardErr;

  const body = await request.json();
  const parsed = appointmentSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const { patientId, ownerId, veterinarianId, scheduledAt, endAt, type, reason, notes, visitAddress } = parsed.data;

  const [newAppt] = await db.insert(appointments).values({
    patientId,
    ownerId,
    veterinarianId,
    scheduledAt: new Date(scheduledAt),
    endAt: new Date(endAt),
    type,
    reason,
    notes,
    visitAddress: visitAddress || null,
  }).returning();
  return jsonOk(newAppt, 201);
};
