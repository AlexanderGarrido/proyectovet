import { medicalRecords } from '../../../db/schema/medical';
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { labOrders } from '../../../db/schema/prescriptions';
import { patients } from '../../../db/schema/patients';
import { users } from '../../../db/schema/users';
import { eq, desc } from 'drizzle-orm';
import { labOrderCreateSchema, zodError, parseJsonBody } from '../../../lib/schemas';

export const GET: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });

  const url = new URL(request.url);
  const patientId = url.searchParams.get('patientId');

  let query = db
    .select({
      id: labOrders.id, type: labOrders.type, description: labOrders.description,
      status: labOrders.status, results: labOrders.results,
      requestedAt: labOrders.requestedAt, completedAt: labOrders.completedAt,
      patientName: patients.name, veterinarianName: users.name,
    })
    .from(labOrders)
    .leftJoin(patients, eq(labOrders.patientId, patients.id))
    .leftJoin(users, eq(labOrders.veterinarianId, users.id))
    .$dynamic();

  if (patientId) query = query.where(eq(labOrders.patientId, Number(patientId)));

  const result = await query.orderBy(desc(labOrders.requestedAt));
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  if (user.role !== 'admin' && user.role !== 'veterinario') {
    return new Response(JSON.stringify({ error: 'Sin permiso' }), { status: 403 });
  }

  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const result_ = labOrderCreateSchema.safeParse(parsed.data);
  if (!result_.success) return zodError(result_.error);
  const { patientId, medicalRecordId, type, description } = result_.data;

  if (medicalRecordId) {
    const [record] = await db.select({ patientId: medicalRecords.patientId }).from(medicalRecords).where(eq(medicalRecords.id, Number(medicalRecordId)));
    if (!record || record.patientId !== Number(patientId)) return new Response(JSON.stringify({ error: 'La consulta no pertenece al paciente seleccionado' }), { status: 400 });
  }

  const [newOrder] = await db.insert(labOrders).values({
    patientId,
    medicalRecordId: medicalRecordId ?? null,
    veterinarianId: user.id,
    type, description,
    requestedAt: new Date(),
  }).returning();
  return new Response(JSON.stringify(newOrder), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
