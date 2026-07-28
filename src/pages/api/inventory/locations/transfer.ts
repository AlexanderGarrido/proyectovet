import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { products, stockByLocation, stockMovements } from '../../../../db/schema/inventory';
import { eq, and, gte, sql } from 'drizzle-orm';
import { stockTransferSchema, zodError, parseJsonBody } from '../../../../lib/schemas';
import { jsonError, jsonOk } from '../../../../lib/http';

const STAFF_ROLES = ['admin', 'veterinario', 'recepcionista'];

class StockOpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * Transfiere stock de un producto entre ubicaciones (ej. bodega central →
 * botiquín del vehículo de un veterinario), sin alterar el total agregado
 * en `products.stock`.
 *
 * Modelo: el "pool central sin asignar" de un producto es implícito —
 * products.stock menos la suma de lo ya asignado a ubicaciones concretas en
 * stockByLocation. Por eso omitir `fromLocationId` retira de ese pool
 * implícito (backward-compatible: productos existentes empiezan con todo su
 * stock "sin asignar", listos para repartirse a botiquines).
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return jsonError(401, 'No autorizado');
  if (!STAFF_ROLES.includes(user.role)) return jsonError(403, 'Sin permiso');

  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const result = stockTransferSchema.safeParse(parsed.data);
  if (!result.success) return zodError(result.error);
  const { productId, toLocationId, fromLocationId, quantity } = result.data;

  if (fromLocationId === toLocationId) {
    return jsonError(400, 'El origen y el destino no pueden ser la misma ubicación');
  }

  try {
    await db.transaction(async (tx) => {
      const [product] = await tx.select({ stock: products.stock }).from(products).where(eq(products.id, productId));
      if (!product) throw new StockOpError('Producto no encontrado', 404);

      if (fromLocationId) {
        const [row] = await tx
          .update(stockByLocation)
          .set({ stock: sql`${stockByLocation.stock} - ${quantity}` })
          .where(and(
            eq(stockByLocation.productId, productId),
            eq(stockByLocation.locationId, fromLocationId),
            gte(sql`${stockByLocation.stock} - ${quantity}`, sql`0`),
          ))
          .returning();
        if (!row) throw new StockOpError('Stock insuficiente en la ubicación de origen', 400);
      } else {
        const [assignedRow] = await tx
          .select({ total: sql<string>`COALESCE(SUM(${stockByLocation.stock}), 0)` })
          .from(stockByLocation)
          .where(eq(stockByLocation.productId, productId));
        const unassigned = parseFloat(product.stock) - parseFloat(assignedRow?.total ?? '0');
        if (unassigned < quantity) {
          throw new StockOpError(`Solo hay ${unassigned.toFixed(3)} sin asignar a ninguna ubicación`, 400);
        }
      }

      await tx
        .insert(stockByLocation)
        .values({ productId, locationId: toLocationId, stock: String(quantity) })
        .onConflictDoUpdate({
          target: [stockByLocation.productId, stockByLocation.locationId],
          set: { stock: sql`${stockByLocation.stock} + ${quantity}` },
        });

      await tx.insert(stockMovements).values({
        productId,
        type: 'transferencia',
        quantity: String(quantity),
        reason: fromLocationId ? 'Transferencia entre ubicaciones' : 'Asignación a botiquín',
        locationId: toLocationId,
        userId: user.id,
      });
    });
  } catch (err) {
    if (err instanceof StockOpError) return jsonError(err.status, err.message);
    throw err;
  }

  return jsonOk({ success: true });
};
