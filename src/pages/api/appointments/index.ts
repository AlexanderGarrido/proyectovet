import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { appointments } from '../../../db/schema/appointments';
import { patients, owners } from '../../../db/schema/patients';
import { users } from '../../../db/schema/users';
import { eq, gte, lte, and, desc, sql, lt, gt, notInArray } from 'drizzle-orm';
import { appointmentSchema, zodError, parseJsonBody } from '../../../lib/schemas';
import { requirePermission } from '../../../lib/guard';
import { jsonError, jsonOk, jsonOkPaginated } from '../../../lib/http';

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
  if (user!.role === 'veterinario') conditions.push(eq(appointments.veterinarianId, user!.id));
  if ((from && !Number.isFinite(Date.parse(from))) || (to && !Number.isFinite(Date.parse(to)))) return jsonError(400, 'Fecha inválida');
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

  const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

  const [result, [{ count }]] = await Promise.all([
    db
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
      .where(whereCondition)
      .orderBy(desc(appointments.scheduledAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(appointments).where(whereCondition),
  ]);

  return jsonOkPaginated(result, count);
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'appointments', 'write');
  if (guardErr) return guardErr;

  const body = await parseJsonBody(request);
  if ('error' in body) return body.error;
  const parsed = appointmentSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);

  const { patientId, ownerId, veterinarianId, scheduledAt, endAt, type, reason, notes, visitAddress, sector, travelBufferMinutes } = parsed.data;
  const buffer = travelBufferMinutes ?? 0;

  return db.transaction(async (tx) => {
    // Serialize schedule writers across creation and rescheduling.
    await tx.execute(sql`select pg_advisory_xact_lock(764210)`);
    const [patient] = await tx.select().from(patients).where(eq(patients.id, patientId));
    if (!patient || patient.ownerId !== ownerId) return jsonError(400, 'El paciente no pertenece al tutor seleccionado');
    const [vet] = await tx.select().from(users).where(eq(users.id, veterinarianId));
    if (!vet || !vet.isActive || vet.role !== 'veterinario') return jsonError(400, 'Veterinario inválido');
    if (user!.role === 'veterinario' && user!.id !== veterinarianId) return jsonError(403, 'Solo puedes programar tu propia agenda');
    // El solapamiento considera el traslado: dos visitas seguidas en
    // domicilios distintos no caben juntas aunque sus horarios no se
    // toquen por un minuto. Con colchón 0 el resultado es el de antes.
    // Las fechas van como ISO, igual que Drizzle mapea las columnas
    // timestamp: un Date crudo dentro de sql`` revienta en postgres-js.
    const [overlap] = await tx.select({ id: appointments.id }).from(appointments).where(and(
      eq(appointments.veterinarianId, veterinarianId),
      notInArray(appointments.status, ['cancelada', 'no_asistio']),
      sql`${appointments.scheduledAt} - make_interval(mins => ${buffer}) < ${new Date(endAt).toISOString()}`,
      sql`${appointments.endAt} + make_interval(mins => ${appointments.travelBufferMinutes}) > ${new Date(scheduledAt).toISOString()}`,
    ));
    if (overlap) return jsonError(409, 'El veterinario ya tiene una cita en ese horario, considerando el traslado declarado');
    const [newAppt] = await tx.insert(appointments).values({
      patientId, ownerId, veterinarianId, scheduledAt: new Date(scheduledAt), endAt: new Date(endAt),
      type, reason, notes, visitAddress: visitAddress || null,
      sector: sector || null, travelBufferMinutes: buffer,
    }).returning();
    return jsonOk(newAppt, 201);
  });
};
