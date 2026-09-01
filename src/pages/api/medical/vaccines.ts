import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { vaccines } from '../../../db/schema/medical';
import { users } from '../../../db/schema/users';
import { products, stockMovements, stockByLocation } from '../../../db/schema/inventory';
import { eq, and, gte, sql, desc } from 'drizzle-orm';
import { vaccineCreateSchema, zodError, parseJsonBody } from '../../../lib/schemas';
import { jsonError, jsonOk } from '../../../lib/http';
import { requirePermission } from '../../../lib/guard';

class StockOpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export const GET: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  // SEGURIDAD: endpoint de staff — requirePermission ya restringe el acceso a
  // los roles con 'vaccines:read'.
  const guardErr = requirePermission(user, 'vaccines', 'read');
  if (guardErr) return guardErr;

  const url = new URL(request.url);
  const patientId = url.searchParams.get('patientId');
  if (!patientId) return jsonError(400, 'patientId requerido');

  const result = await db
    .select({
      id: vaccines.id,
      name: vaccines.name,
      brand: vaccines.brand,
      batchNumber: vaccines.batchNumber,
      applicationDate: vaccines.applicationDate,
      nextDoseDate: vaccines.nextDoseDate,
      notes: vaccines.notes,
      veterinarianName: users.name,
    })
    .from(vaccines)
    .leftJoin(users, eq(vaccines.veterinarianId, users.id))
    .where(eq(vaccines.patientId, Number(patientId)))
    .orderBy(desc(vaccines.applicationDate));

  return jsonOk(result);
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'vaccines', 'write');
  if (guardErr) return guardErr;

  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const result_ = vaccineCreateSchema.safeParse(parsed.data);
  if (!result_.success) return zodError(result_.error);
  const { patientId, name, brand, batchNumber, applicationDate, nextDoseDate, notes, productId, locationId } = result_.data;

  try {
    const newVaccine = await db.transaction(async (tx) => {
      const [vaccine] = await tx.insert(vaccines).values({
        patientId,
        veterinarianId: user!.id,
        name,
        brand: brand ?? null,
        batchNumber: batchNumber ?? null,
        applicationDate,
        nextDoseDate: nextDoseDate ?? null,
        notes: notes ?? null,
        productId: productId ?? null,
      }).returning();

      // Antes las vacunas nunca afectaban el inventario aunque existiera la
      // categoría "vacuna" en productos. Si se vincula un producto, la dosis
      // aplicada descuenta stock igual que un insumo de consulta.
      if (productId) {
        const [product] = await tx
          .update(products)
          .set({ stock: sql`${products.stock} - 1` })
          .where(and(eq(products.id, productId), gte(sql`${products.stock} - 1`, sql`0`)))
          .returning({ id: products.id });
        if (!product) {
          throw new StockOpError('Stock insuficiente de la vacuna en inventario', 409);
        }

        if (locationId) {
          const [locRow] = await tx
            .update(stockByLocation)
            .set({ stock: sql`${stockByLocation.stock} - 1` })
            .where(and(
              eq(stockByLocation.productId, productId),
              eq(stockByLocation.locationId, locationId),
              gte(sql`${stockByLocation.stock} - 1`, sql`0`),
            ))
            .returning();
          if (!locRow) {
            throw new StockOpError('Stock insuficiente en el botiquín seleccionado', 409);
          }
        }

        await tx.insert(stockMovements).values({
          productId,
          type: 'consumo_interno',
          quantity: '1',
          reason: `Vacuna aplicada: ${name}`,
          referenceType: 'vaccine',
          referenceId: vaccine.id,
          locationId: locationId ?? null,
          userId: user!.id,
        });
      }

      return vaccine;
    });

    return jsonOk(newVaccine, 201);
  } catch (err) {
    if (err instanceof StockOpError) return jsonError(err.status, err.message);
    throw err;
  }
};
