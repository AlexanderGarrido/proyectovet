import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { users } from '../../../db/schema/users';
import { and, eq } from 'drizzle-orm';

// No migrado a guard.ts: no hay un recurso propio para "lista de
// veterinarios" en permissions.ts, y mapearlo a 'appointments:read' dejaría
// pasar a un tutor (tiene appointments:read:own) sin necesitarlo.
const STAFF_ROLES = ['admin', 'veterinario', 'recepcionista'];

/**
 * Lista mínima de veterinarios activos (solo id + nombre), para poblar el
 * selector del formulario de citas. A diferencia de /api/users (solo admin),
 * este endpoint es accesible para todo el staff que puede agendar citas.
 */
export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  if (!STAFF_ROLES.includes(user.role)) {
    return new Response(JSON.stringify({ error: 'Sin permiso' }), { status: 403 });
  }

  const vets = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.role, 'veterinario'), eq(users.isActive, true)));

  return new Response(JSON.stringify(vets), { headers: { 'Content-Type': 'application/json' } });
};
