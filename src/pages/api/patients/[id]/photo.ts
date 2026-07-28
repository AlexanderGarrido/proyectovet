import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { patients } from '../../../../db/schema/patients';
import { eq } from 'drizzle-orm';
import { jsonError } from '../../../../lib/http';

// No migrado a guard.ts a propósito: 'patients:read' también lo cumple un
// tutor (vía la variante :own), pero este endpoint no verifica pertenencia
// — es la ruta optimizada para las tarjetas del listado de STAFF. Un tutor
// ya recibe la foto de su propia mascota embebida en /api/client/portal.
const STAFF_ROLES = ['admin', 'veterinario', 'recepcionista'];

/**
 * Sirve la foto del paciente decodificando el data URL guardado en
 * `patients.photo`. Se usa desde las tarjetas del listado (`<img src=…>`)
 * para no inflar el payload de la lista con base64.
 */
export const GET: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return jsonError(401, 'No autorizado');
  if (!STAFF_ROLES.includes(user.role)) return jsonError(403, 'Sin permiso');

  const id = Number(params.id);
  if (!id || isNaN(id) || id <= 0) return jsonError(400, 'ID inválido');

  const [row] = await db.select({ photo: patients.photo }).from(patients).where(eq(patients.id, id));
  const match = row?.photo?.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return new Response(null, { status: 404 });

  const bytes = Buffer.from(match[2], 'base64');
  return new Response(bytes, {
    headers: {
      'Content-Type': match[1],
      'Cache-Control': 'private, max-age=300',
      'Content-Length': String(bytes.length),
    },
  });
};
