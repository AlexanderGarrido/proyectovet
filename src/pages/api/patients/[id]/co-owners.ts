import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { patients, owners } from '../../../../db/schema/patients';
import { patientCoOwners } from '../../../../db/schema/co-owners';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody } from '../../../../lib/schemas';
import { logAudit } from '../../../../lib/audit';
import { canTutorAccessPatient } from '../../../../lib/ownership';
import { requirePermission } from '../../../../lib/guard';

export const GET: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  // SEGURIDAD (IDOR): antes solo exigía sesión — cualquier tutor autenticado
  // podía consultar los co-tutores de CUALQUIER mascota (nombre, teléfono,
  // email de terceros) sin verificar pertenencia.
  const guardErr = requirePermission(user, 'patients', 'read');
  if (guardErr) return guardErr;

  const patientId = Number(params.id);
  if (!patientId || isNaN(patientId)) return new Response(JSON.stringify({ error: 'ID inválido' }), { status: 400 });

  if (user!.role === 'tutor') {
    const allowed = await canTutorAccessPatient(user!.id, patientId);
    if (!allowed) return new Response(JSON.stringify({ error: 'Sin permiso' }), { status: 403 });
  }

  const coOwners = await db
    .select({ id: owners.id, firstName: owners.firstName, lastName: owners.lastName, phone: owners.phone, email: owners.email })
    .from(patientCoOwners)
    .innerJoin(owners, eq(patientCoOwners.ownerId, owners.id))
    .where(eq(patientCoOwners.patientId, patientId));

  return new Response(JSON.stringify(coOwners), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'patients', 'write');
  if (guardErr) return guardErr;

  const patientId = Number(params.id);
  if (!patientId || isNaN(patientId)) return new Response(JSON.stringify({ error: 'ID inválido' }), { status: 400 });

  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const ownerId = Number((parsed.data as { ownerId?: unknown })?.ownerId);
  if (!ownerId || isNaN(ownerId)) return new Response(JSON.stringify({ error: 'Tutor requerido' }), { status: 400 });

  const [patient] = await db.select({ ownerId: patients.ownerId }).from(patients).where(eq(patients.id, patientId));
  if (!patient) return new Response(JSON.stringify({ error: 'Paciente no encontrado' }), { status: 404 });
  if (patient.ownerId === ownerId) {
    return new Response(JSON.stringify({ error: 'Ese tutor ya es el tutor principal de esta mascota' }), { status: 400 });
  }

  const [owner] = await db.select({ id: owners.id, firstName: owners.firstName, lastName: owners.lastName }).from(owners).where(eq(owners.id, ownerId));
  if (!owner) return new Response(JSON.stringify({ error: 'Tutor no encontrado' }), { status: 404 });

  const [existing] = await db.select({ id: patientCoOwners.id }).from(patientCoOwners)
    .where(and(eq(patientCoOwners.patientId, patientId), eq(patientCoOwners.ownerId, ownerId)));
  if (existing) return new Response(JSON.stringify({ error: 'Este tutor ya está agregado' }), { status: 400 });

  await db.insert(patientCoOwners).values({ patientId, ownerId });
  await logAudit({
    userId: user!.id, userName: user!.name, action: 'patient.co_owner_add',
    entityType: 'patient', entityId: patientId, metadata: { ownerId, ownerName: `${owner.firstName} ${owner.lastName}` },
  });

  return new Response(JSON.stringify(owner), { status: 201, headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'patients', 'write');
  if (guardErr) return guardErr;

  const patientId = Number(params.id);
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const ownerId = Number((parsed.data as { ownerId?: unknown })?.ownerId);
  if (!patientId || !ownerId) return new Response(JSON.stringify({ error: 'Datos inválidos' }), { status: 400 });

  await db.delete(patientCoOwners).where(and(eq(patientCoOwners.patientId, patientId), eq(patientCoOwners.ownerId, ownerId)));
  await logAudit({
    userId: user!.id, userName: user!.name, action: 'patient.co_owner_remove',
    entityType: 'patient', entityId: patientId, metadata: { ownerId },
  });

  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
};
