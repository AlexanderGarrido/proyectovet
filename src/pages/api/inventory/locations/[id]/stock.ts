import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { products, stockByLocation } from '../../../../../db/schema/inventory';
import { eq, and, gt } from 'drizzle-orm';
import { jsonError, jsonOk } from '../../../../../lib/http';
import { requirePermission } from '../../../../../lib/guard';

/** Stock asignado a una ubicación concreta del botiquín itinerante. */
export const GET: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'inventory', 'read');
  if (guardErr) return guardErr;

  const locationId = Number(params.id);
  if (!locationId || isNaN(locationId)) return jsonError(400, 'ID inválido');

  const result = await db
    .select({
      productId: products.id,
      productName: products.name,
      unit: products.unit,
      stock: stockByLocation.stock,
    })
    .from(stockByLocation)
    .innerJoin(products, eq(stockByLocation.productId, products.id))
    .where(and(eq(stockByLocation.locationId, locationId), gt(stockByLocation.stock, '0')));

  return jsonOk(result);
};
