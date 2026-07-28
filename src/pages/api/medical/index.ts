import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { medicalRecords, vaccines } from '../../../db/schema/medical';
import { users } from '../../../db/schema/users';
import { patients } from '../../../db/schema/patients';
import { products, stockMovements, stockByLocation } from '../../../db/schema/inventory';
import { eq, and, gte, sql, desc, inArray } from 'drizzle-orm';
import { medicalRecordCreateSchema, zodError, parseJsonBody } from '../../../lib/schemas';

class StockOpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const STAFF_ROLES = ['admin', 'veterinario', 'recepcionista'];

export const GET: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  if (!STAFF_ROLES.includes(user.role)) {
    return new Response(JSON.stringify({ error: 'Acceso denegado' }), { status: 403 });
  }

  const url = new URL(request.url);
  const patientId = url.searchParams.get('patientId');
  if (!patientId) return new Response(JSON.stringify({ error: 'patientId requerido' }), { status: 400 });

  const records = await db
    .select({
      id: medicalRecords.id,
      date: medicalRecords.date,
      reason: medicalRecords.reason,
      subjective: medicalRecords.subjective,
      diagnosis: medicalRecords.diagnosis,
      treatment: medicalRecords.treatment,
      observations: medicalRecords.observations,
      vitalSigns: medicalRecords.vitalSigns,
      veterinarianId: medicalRecords.veterinarianId,
      veterinarianName: users.name,
    })
    .from(medicalRecords)
    .leftJoin(users, eq(medicalRecords.veterinarianId, users.id))
    .where(eq(medicalRecords.patientId, Number(patientId)))
    .orderBy(desc(medicalRecords.date));

  return new Response(JSON.stringify(records), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  if (user.role !== 'admin' && user.role !== 'veterinario') {
    return new Response(JSON.stringify({ error: 'Sin permiso' }), { status: 403 });
  }

  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const result_ = medicalRecordCreateSchema.safeParse(parsed.data);
  if (!result_.success) return zodError(result_.error);
  const { patientId, appointmentId, date, reason, subjective, diagnosis, treatment, observations, vitalSigns, suppliesUsed } = result_.data;

  // Chequeo temprano (mejora UX: falla rápido con mensaje claro), pero NO es
  // la única defensa — la resta real es atómica dentro de la transacción de
  // abajo, así que sigue siendo segura aunque este pre-chequeo quede
  // desactualizado por una carrera con otra consulta concurrente.
  if (suppliesUsed && suppliesUsed.length > 0) {
    const productIds = suppliesUsed.map((s) => s.productId);
    const found = await db.select({ id: products.id, name: products.name, stock: products.stock, unit: products.unit })
      .from(products).where(inArray(products.id, productIds));
    const byId = new Map(found.map((p) => [p.id, p]));

    for (const supply of suppliesUsed) {
      const product = byId.get(supply.productId);
      if (!product) {
        return new Response(JSON.stringify({ error: `Insumo con ID ${supply.productId} no encontrado` }), { status: 404 });
      }
      if (parseFloat(product.stock) < supply.quantity) {
        return new Response(
          JSON.stringify({ error: `Stock insuficiente de "${product.name}": quedan ${product.stock} ${product.unit}, se intentó usar ${supply.quantity}` }),
          { status: 400 },
        );
      }
    }
  }

  try {
    const newRecord = await db.transaction(async (tx) => {
      const [record] = await tx.insert(medicalRecords).values({
        patientId,
        veterinarianId: user.id,
        appointmentId: appointmentId ?? null,
        date: date ? new Date(date) : new Date(),
        reason, subjective, diagnosis, treatment, observations,
        vitalSigns: vitalSigns ?? null,
      }).returning();

      if (suppliesUsed && suppliesUsed.length > 0) {
        for (const supply of suppliesUsed) {
          // BUGFIX (condición de carrera): resta atómica en el propio UPDATE
          // en vez de leer-calcular-escribir; el WHERE con gte(...,0) impide
          // quedar en negativo aunque dos consultas descuenten el mismo
          // insumo al mismo tiempo. Ver mismo patrón en inventory/stock.ts.
          const [product] = await tx
            .update(products)
            .set({ stock: sql`${products.stock} - ${supply.quantity}` })
            .where(and(
              eq(products.id, supply.productId),
              gte(sql`${products.stock} - ${supply.quantity}`, sql`0`),
            ))
            .returning({ id: products.id, name: products.name });

          if (!product) {
            throw new StockOpError(`Stock insuficiente de insumo ID ${supply.productId} (lo tomó otra consulta en curso)`, 409);
          }

          // Botiquín itinerante: si el insumo se tomó de una ubicación
          // concreta (ej. el vehículo del vet), descuenta también de ahí,
          // con la misma guarda atómica anti-negativo.
          if (supply.locationId) {
            const [locRow] = await tx
              .update(stockByLocation)
              .set({ stock: sql`${stockByLocation.stock} - ${supply.quantity}` })
              .where(and(
                eq(stockByLocation.productId, supply.productId),
                eq(stockByLocation.locationId, supply.locationId),
                gte(sql`${stockByLocation.stock} - ${supply.quantity}`, sql`0`),
              ))
              .returning();
            if (!locRow) {
              throw new StockOpError(`Stock insuficiente en el botiquín seleccionado para el insumo ID ${supply.productId}`, 409);
            }
          }

          await tx.insert(stockMovements).values({
            productId: supply.productId,
            type: 'consumo_interno',
            quantity: String(supply.quantity),
            reason: `Consulta: ${reason}`,
            referenceType: 'medical_record',
            referenceId: record.id,
            locationId: supply.locationId ?? null,
            userId: user.id,
          });
        }
      }

      return record;
    });

    return new Response(JSON.stringify(newRecord), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (err instanceof StockOpError) {
      return new Response(JSON.stringify({ error: err.message }), { status: err.status });
    }
    throw err;
  }
};
