import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { stockLocations } from '../../../../db/schema/inventory';
import { eq } from 'drizzle-orm';
import { stockLocationSchema, zodError, parseJsonBody } from '../../../../lib/schemas';
import { jsonError, jsonOk } from '../../../../lib/http';
import { requirePermission } from '../../../../lib/guard';

/**
 * Botiquín itinerante: ubicaciones de inventario (bodega central vs.
 * vehículo/maletín de cada veterinario). Ver stockByLocation en
 * db/schema/inventory.ts y /api/inventory/locations/transfer para mover
 * stock entre ubicaciones.
 */
export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'inventory', 'read');
  if (guardErr) return guardErr;

  const result = await db.select().from(stockLocations).where(eq(stockLocations.isActive, true));
  return jsonOk(result);
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return jsonError(401, 'No autorizado');
  // Crear/editar ubicaciones es una acción de configuración, no de uso diario.
  if (user.role !== 'admin') return jsonError(403, 'Sin permiso');

  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const result = stockLocationSchema.safeParse(parsed.data);
  if (!result.success) return zodError(result.error);
  const { name, type, assignedVetId } = result.data;

  const [newLocation] = await db.insert(stockLocations).values({
    name, type, assignedVetId: assignedVetId || null,
  }).returning();

  return jsonOk(newLocation, 201);
};
