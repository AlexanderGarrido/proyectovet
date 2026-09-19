import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { products, stockLocations, stockByLocation } from '../db/schema/inventory';
import { appointments } from '../db/schema/appointments';
import { appointmentPlannedServices } from '../db/schema/services';
import { resolveServices } from './services';
import { clinicDayRange } from './clinic-time';
import { VisitError } from './visit-operation';

export interface KitLine {
  productId: number;
  name: string;
  unit: string;
  /** Existencia registrada en el botiquín según el servidor. */
  available: number;
  /** Mínimo declarado para el producto. */
  minimum: number;
  /** Cantidad que exigen las prestaciones planificadas del día. */
  planned: number;
  /** Lo que falta para cubrir mínimo y plan. */
  missing: number;
  reason: 'minimo' | 'plan' | 'ambos';
}

export interface KitReport {
  locationId: number | null;
  locationName: string | null;
  day: string;
  lines: KitLine[];
  plannedVisits: number;
  /** Visitas del día sin prestaciones planificadas: el plan es parcial. */
  visitsWithoutPlan: number;
  /** Prestaciones planificadas que ya no están en el catálogo. */
  unresolvedServices: number;
  /** El cálculo usa existencias del servidor, no la copia del dispositivo. */
  note: string;
}

/**
 * Faltantes del botiquín antes de salir.
 *
 * Se calcula sobre las existencias que tiene el servidor, no sobre la copia
 * descargada: esa es informativa y puede llevar horas desactualizada. Y se
 * declara cuántas visitas del día no tienen prestaciones planificadas,
 * porque una lista de faltantes calculada sobre la mitad del plan parecería
 * completa sin serlo.
 */
export async function loadKit(user: { id: string; role: string }, day: string): Promise<KitReport> {
  const { start, end } = clinicDayRange(day);

  const [location] = await db.select().from(stockLocations)
    .where(and(
      eq(stockLocations.isActive, true),
      user.role === 'veterinario' ? eq(stockLocations.assignedVetId, user.id) : undefined,
    ))
    .orderBy(asc(stockLocations.id))
    .limit(1);

  const visits = await db.select({ id: appointments.id })
    .from(appointments)
    .where(and(
      sql`${appointments.scheduledAt} >= ${start} AND ${appointments.scheduledAt} < ${end}`,
      user.role === 'veterinario' ? eq(appointments.veterinarianId, user.id) : undefined,
      sql`${appointments.status} NOT IN ('cancelada', 'no_asistio', 'completada')`,
    ))
    .limit(150);

  const planned = visits.length
    ? await db.select({ appointmentId: appointmentPlannedServices.appointmentId, serviceId: appointmentPlannedServices.serviceId, quantity: appointmentPlannedServices.quantity })
      .from(appointmentPlannedServices)
      .where(inArray(appointmentPlannedServices.appointmentId, visits.map((v) => v.id)))
    : [];

  // Las prestaciones se agregan por producto, no por visita: el botiquín se
  // carga una vez para toda la jornada. Se resuelven todas en una llamada;
  // una consulta por prestación multiplicaría los viajes a la base sin
  // ganar nada.
  const aggregated = new Map<number, number>();
  const items = groupQuantities(planned).map(([serviceId, quantity]) => ({ serviceId, quantity }));
  let unresolvedServices = 0;
  let resolvedItems: Awaited<ReturnType<typeof resolveServices>> = [];
  if (items.length) {
    try {
      resolvedItems = await resolveServices(db, items);
    } catch (error) {
      // Una prestación retirada del catálogo no puede dejar sin cargar toda
      // la pantalla de preparación: se omite y se declara, que es lo que
      // permite decidir si la lista sirve o hay que revisar el plan.
      if (!(error instanceof VisitError)) throw error;
      const resolvable = await Promise.all(items.map(async (item) => {
        try { return await resolveServices(db, [item]); } catch { unresolvedServices++; return []; }
      }));
      resolvedItems = resolvable.flat();
    }
  }
  for (const resolved of resolvedItems) {
    for (const supply of [...resolved.supplies, ...resolved.optionalSupplies]) {
      aggregated.set(supply.productId, Math.round(((aggregated.get(supply.productId) ?? 0) + supply.quantity) * 1000) / 1000);
    }
  }

  const productRows = await db.select({
    id: products.id, name: products.name, unit: products.unit, minStock: products.minStock, stock: products.stock,
  }).from(products).where(eq(products.isActive, true)).limit(500);

  const stocks = location
    ? await db.select({ productId: stockByLocation.productId, stock: stockByLocation.stock })
      .from(stockByLocation).where(eq(stockByLocation.locationId, location.id))
    : [];
  const availableByProduct = new Map(stocks.map((s) => [s.productId, Number(s.stock)]));

  const lines = computeKitLines(productRows, availableByProduct, aggregated, Boolean(location));

  const plannedVisitIds = new Set(planned.map((p) => p.appointmentId));

  return {
    locationId: location?.id ?? null,
    locationName: location?.name ?? null,
    day,
    lines,
    plannedVisits: plannedVisitIds.size,
    visitsWithoutPlan: visits.length - plannedVisitIds.size,
    unresolvedServices,
    note: 'Calculado con las existencias del servidor. La copia descargada en el dispositivo puede diferir y no reserva stock.',
  };
}

export interface KitProduct { id: number; name: string; unit: string; minStock: string; stock: string }

/**
 * Qué falta cargar. Se compara lo disponible contra dos exigencias
 * distintas —el mínimo del producto y lo que pide el plan del día— y se
 * dice cuál de las dos lo motiva: reponer un mínimo puede esperar, pero
 * salir sin lo que exige una prestación agendada no.
 */
export function computeKitLines(
  products: KitProduct[],
  availableByProduct: Map<number, number>,
  plannedByProduct: Map<number, number>,
  hasLocation: boolean,
): KitLine[] {
  const lines: KitLine[] = [];
  for (const product of products) {
    // Sin botiquín asignado se usa el stock general: mostrar cero haría
    // parecer que falta absolutamente todo.
    const available = hasLocation ? availableByProduct.get(product.id) ?? 0 : Number(product.stock);
    const minimum = Number(product.minStock);
    const planned = plannedByProduct.get(product.id) ?? 0;
    const missing = Math.round(Math.max(0, Math.max(minimum, planned) - available) * 1000) / 1000;
    if (missing <= 0) continue;
    lines.push({
      productId: product.id, name: product.name, unit: product.unit,
      available, minimum, planned, missing,
      reason: planned > available && minimum > available ? 'ambos' : planned > available ? 'plan' : 'minimo',
    });
  }
  // Lo que exige el plan va primero: es lo que impide atender hoy.
  const weight = (reason: KitLine['reason']) => (reason === 'plan' ? 0 : reason === 'ambos' ? 1 : 2);
  return lines.sort((a, b) => (weight(a.reason) - weight(b.reason)) || (b.missing - a.missing));
}

function groupQuantities(rows: { serviceId: number; quantity: string }[]): [number, number][] {
  const totals = new Map<number, number>();
  for (const row of rows) totals.set(row.serviceId, (totals.get(row.serviceId) ?? 0) + Number(row.quantity));
  return [...totals.entries()];
}
