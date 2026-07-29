import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { owners, patients } from '../../../db/schema/patients';
import { eq } from 'drizzle-orm';
import { ownerUpdateSchema, zodError, parseJsonBody } from '../../../lib/schemas';
import { logAudit } from '../../../lib/audit';
import { requirePermission } from '../../../lib/guard';

// SEGURIDAD (IDOR): antes solo exigía sesión — cualquier tutor autenticado
// podía leer/modificar la ficha de CUALQUIER otro tutor (email, teléfono,
// dirección, documento de identidad). Los tutores editan su propio contacto
// vía /api/client/profile, nunca este endpoint — es 100% de staff.
// hasPermission ya rechaza tutor (no tiene 'owners' en absoluto), sin
// necesitar la variante "unscoped".

export const GET: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'owners', 'read');
  if (guardErr) return guardErr;

  const id = Number(params.id);
  if (!id || isNaN(id) || id <= 0) {
    return new Response(JSON.stringify({ error: 'ID inválido' }), { status: 400 });
  }
  const [owner] = await db.select().from(owners).where(eq(owners.id, id));
  if (!owner) return new Response(JSON.stringify({ error: 'No encontrado' }), { status: 404 });

  const ownerPatients = await db.select().from(patients).where(eq(patients.ownerId, id));
  return new Response(JSON.stringify({ ...owner, patients: ownerPatients }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'owners', 'write');
  if (guardErr) return guardErr;

  const id = Number(params.id);
  if (!id || isNaN(id) || id <= 0) {
    return new Response(JSON.stringify({ error: 'ID inválido' }), { status: 400 });
  }
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const result = ownerUpdateSchema.safeParse(parsed.data);
  if (!result.success) return zodError(result.error);
  const { firstName, lastName, email, phone, address, documentId } = result.data;

  await db.update(owners).set({ firstName, lastName, email, phone, address, documentId }).where(eq(owners.id, id));
  const [updated] = await db.select().from(owners).where(eq(owners.id, id));
  return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  if (user.role !== 'admin' && user.role !== 'recepcionista') {
    return new Response(JSON.stringify({ error: 'Sin permiso' }), { status: 403 });
  }

  const id = Number(params.id);
  if (!id || isNaN(id) || id <= 0) {
    return new Response(JSON.stringify({ error: 'ID inválido' }), { status: 400 });
  }

  // Verificar si tiene pacientes activos antes de eliminar
  const activePatients = await db.select({ id: patients.id }).from(patients)
    .where(eq(patients.ownerId, id));
  if (activePatients.length > 0) {
    return new Response(
      JSON.stringify({ error: `No se puede eliminar: el tutor tiene ${activePatients.length} paciente(s) registrado(s). Elimine o reasigne los pacientes primero.` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const [before] = await db.select({ firstName: owners.firstName, lastName: owners.lastName, email: owners.email }).from(owners).where(eq(owners.id, id));
  await db.delete(owners).where(eq(owners.id, id));
  await logAudit({
    userId: user.id, userName: user.name, action: 'owner.delete',
    entityType: 'owner', entityId: id, metadata: before ?? undefined,
  });
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
};
