import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { prescriptions, prescriptionItems } from '../../../db/schema/prescriptions';
import { patients, owners } from '../../../db/schema/patients';
import { users } from '../../../db/schema/users';
import { eq } from 'drizzle-orm';
import { prescriptionUpdateSchema, zodError, parseJsonBody } from '../../../lib/schemas';
import { requirePermission, requireUnscopedPermission } from '../../../lib/guard';

// SEGURIDAD (IDOR): antes solo exigía sesión — cualquier tutor autenticado
// podía leer o modificar cualquier receta ajena. El portal ya trae las
// recetas del tutor embebidas (con medicamentos) en /api/client/portal; no
// hay ningún flujo de UI que llame este endpoint para un tutor.
export const GET: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  const guardErr = requireUnscopedPermission(user, 'prescriptions', 'read');
  if (guardErr) return guardErr;

  const id = Number(params.id);
  if (!id || isNaN(id) || id <= 0) {
    return new Response(JSON.stringify({ error: 'ID inválido' }), { status: 400 });
  }
  const [rx] = await db
    .select({
      id: prescriptions.id, date: prescriptions.date, status: prescriptions.status, notes: prescriptions.notes,
      patientId: prescriptions.patientId, patientName: patients.name,
      ownerFirstName: owners.firstName, ownerLastName: owners.lastName, ownerPhone: owners.phone,
      veterinarianName: users.name,
    })
    .from(prescriptions)
    .leftJoin(patients, eq(prescriptions.patientId, patients.id))
    .leftJoin(owners, eq(patients.ownerId, owners.id))
    .leftJoin(users, eq(prescriptions.veterinarianId, users.id))
    .where(eq(prescriptions.id, id));

  if (!rx) return new Response(JSON.stringify({ error: 'No encontrado' }), { status: 404 });

  const items = await db.select().from(prescriptionItems).where(eq(prescriptionItems.prescriptionId, id));
  return new Response(JSON.stringify({ ...rx, items }), { headers: { 'Content-Type': 'application/json' } });
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'prescriptions', 'write');
  if (guardErr) return guardErr;

  const id = Number(params.id);
  if (!id || isNaN(id) || id <= 0) {
    return new Response(JSON.stringify({ error: 'ID inválido' }), { status: 400 });
  }
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const result = prescriptionUpdateSchema.safeParse(parsed.data);
  if (!result.success) return zodError(result.error);
  await db.update(prescriptions).set({ status: result.data.status, notes: result.data.notes }).where(eq(prescriptions.id, id));
  const [updated] = await db.select().from(prescriptions).where(eq(prescriptions.id, id));
  return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
};
