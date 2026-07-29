import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { labOrders } from '../../../db/schema/prescriptions';
import { eq } from 'drizzle-orm';
import { labOrderUpdateSchema, zodError, parseJsonBody } from '../../../lib/schemas';
import { requirePermission } from '../../../lib/guard';

// SEGURIDAD (IDOR): antes solo exigía sesión — cualquier tutor autenticado
// podía alterar el estado o los RESULTADOS de cualquier orden de
// laboratorio ajena. Tutor no tiene "lab-orders:write" en ninguna forma,
// así que requirePermission lo bloquea directamente.
export const PUT: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'lab-orders', 'write');
  if (guardErr) return guardErr;

  const id = Number(params.id);
  if (!id || isNaN(id) || id <= 0) {
    return new Response(JSON.stringify({ error: 'ID inválido' }), { status: 400 });
  }
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const result = labOrderUpdateSchema.safeParse(parsed.data);
  if (!result.success) return zodError(result.error);
  const { status, results } = result.data;

  await db.update(labOrders).set({
    status,
    results: results || null,
    completedAt: status === 'completado' ? new Date() : null,
  }).where(eq(labOrders.id, id));

  const [updated] = await db.select().from(labOrders).where(eq(labOrders.id, id));
  return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
};
