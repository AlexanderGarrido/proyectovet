import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { products, stockMovements } from '../../../db/schema/inventory';
import { eq, and, gte, sql } from 'drizzle-orm';
import { stockMovementSchema, zodError } from '../../../lib/schemas';
import { jsonError, jsonOk } from '../../../lib/http';
import { requirePermission } from '../../../lib/guard';

class StockOpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'inventory', 'write');
  if (guardErr) return guardErr;

  const body = await request.json();
  const parsed = stockMovementSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const { productId, type, quantity, reason } = parsed.data;

  // stock/quantity son columnas decimal → llegan como string desde la BD;
  // sumarlas directo concatenaría texto en vez de sumar.
  const isOutflow = type === 'salida' || type === 'consumo_interno';
  const delta = isOutflow ? -quantity : quantity;

  try {
    const updated = await db.transaction(async (tx) => {
      // BUGFIX (condición de carrera): antes se leía el stock, se calculaba
      // el nuevo valor en JS y se escribía en un UPDATE aparte. Dos descuentos
      // concurrentes (dos vets en terreno) podían pisarse el resultado uno al
      // otro (lost update) y dejar el stock descuadrado o negativo pese al
      // chequeo previo. Ahora la resta es atómica en el propio UPDATE, y el
      // WHERE con gte(...,0) evita el negativo aunque compitan varias
      // solicitudes al mismo tiempo — Postgres serializa la fila.
      const [product] = await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${delta}` })
        .where(and(
          eq(products.id, productId),
          gte(sql`${products.stock} + ${delta}`, sql`0`),
        ))
        .returning();

      if (!product) {
        const [exists] = await tx.select({ id: products.id }).from(products).where(eq(products.id, productId));
        throw new StockOpError(exists ? 'Stock insuficiente' : 'Producto no encontrado', exists ? 400 : 404);
      }

      await tx.insert(stockMovements).values({
        productId, type, quantity: String(quantity), reason: reason || null, userId: user!.id,
      });

      return product;
    });

    return jsonOk(updated);
  } catch (err) {
    if (err instanceof StockOpError) return jsonError(err.status, err.message);
    throw err;
  }
};
