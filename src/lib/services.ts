import { and, eq, inArray } from 'drizzle-orm';
import { services, serviceComponents } from '../db/schema/services';
import { toCents } from './money';
import { VisitError } from './visit-operation';

export interface ResolvedService {
  serviceId: number;
  name: string;
  quantity: number;
  /** Precio unitario vigente en el servidor, en centavos. */
  unitPriceCents: number;
  subtotalCents: number;
  aftercare: string[];
  /** Insumos que la prestación descuenta sin intervención del usuario. */
  supplies: { productId: number; quantity: number }[];
  /** Insumos que el profesional debe confirmar caso a caso. */
  optionalSupplies: { productId: number; quantity: number }[];
}

/**
 * Resuelve las prestaciones declaradas contra el catálogo del servidor.
 *
 * El cliente nunca envía precios: envía qué se realizó y en qué cantidad.
 * Si lo hiciera, una copia descargada con una tarifa antigua —o un
 * dispositivo manipulado— podría fijar el monto de la atención. El importe
 * se calcula siempre aquí, con la tarifa vigente al confirmar.
 *
 * Un paquete se cobra a su propio precio, como una línea; sus prestaciones
 * hijas aportan insumos e indicaciones, no líneas adicionales. Cobrar el
 * paquete y además cada componente sería cobrar dos veces lo mismo.
 */
export async function resolveServices(
  tx: { select: any },
  items: { serviceId: number; quantity: number }[],
): Promise<ResolvedService[]> {
  if (!items.length) return [];
  const ids = [...new Set(items.map((i) => i.serviceId))];

  const rows = await tx.select().from(services).where(and(inArray(services.id, ids), eq(services.isActive, true)));
  const byId = new Map<number, typeof services.$inferSelect>(rows.map((r: typeof services.$inferSelect) => [r.id, r]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) throw new VisitError(409, `Hay prestaciones que ya no están disponibles en el catálogo (${missing.join(', ')}). Revisa el cobro antes de guardar.`);

  // Los componentes se piden de una vez, incluidos los de las prestaciones
  // hijas de un paquete: una consulta por servicio multiplicaría el número
  // de viajes a la base dentro de la transacción.
  const components = await loadComponents(tx, ids);

  return items.map(({ serviceId, quantity }) => {
    const service = byId.get(serviceId)!;
    const unitPriceCents = toCents(service.price);
    const expanded = expand(serviceId, components, new Set());
    return {
      serviceId,
      name: service.name,
      quantity,
      unitPriceCents,
      subtotalCents: Math.round(unitPriceCents * quantity),
      aftercare: [service.aftercare, ...expanded.aftercare].filter((a): a is string => Boolean(a)),
      supplies: expanded.supplies.filter((s) => !s.optional).map((s) => ({ productId: s.productId, quantity: round3(s.quantity * quantity) })),
      optionalSupplies: expanded.supplies.filter((s) => s.optional).map((s) => ({ productId: s.productId, quantity: round3(s.quantity * quantity) })),
    };
  });
}

/** Tres decimales: la misma precisión que la columna de stock. */
const round3 = (value: number) => Math.round(value * 1000) / 1000;

interface ComponentRow { serviceId: number; productId: number | null; childServiceId: number | null; quantity: string; optional: boolean; aftercare: string | null }

async function loadComponents(tx: { select: any }, rootIds: number[]): Promise<Map<number, ComponentRow[]>> {
  const byService = new Map<number, ComponentRow[]>();
  let frontier = rootIds;
  const seen = new Set<number>(rootIds);
  // Profundidad acotada: un paquete que se contenga a sí mismo por error de
  // datos no debe colgar la transacción.
  for (let depth = 0; depth < 4 && frontier.length; depth++) {
    const rows: ComponentRow[] = await tx.select({
      serviceId: serviceComponents.serviceId, productId: serviceComponents.productId,
      childServiceId: serviceComponents.childServiceId, quantity: serviceComponents.quantity,
      optional: serviceComponents.optional, aftercare: services.aftercare,
    }).from(serviceComponents)
      .leftJoin(services, eq(serviceComponents.childServiceId, services.id))
      .where(inArray(serviceComponents.serviceId, frontier));

    for (const row of rows) {
      const list = byService.get(row.serviceId) ?? [];
      list.push(row);
      byService.set(row.serviceId, list);
    }
    frontier = rows.map((r) => r.childServiceId).filter((id): id is number => id !== null && !seen.has(id));
    for (const id of frontier) seen.add(id);
  }
  return byService;
}

function expand(serviceId: number, components: Map<number, ComponentRow[]>, visited: Set<number>): { supplies: { productId: number; quantity: number; optional: boolean }[]; aftercare: string[] } {
  if (visited.has(serviceId)) return { supplies: [], aftercare: [] };
  visited.add(serviceId);
  const supplies: { productId: number; quantity: number; optional: boolean }[] = [];
  const aftercare: string[] = [];
  for (const row of components.get(serviceId) ?? []) {
    const quantity = Number(row.quantity);
    if (row.productId) supplies.push({ productId: row.productId, quantity, optional: row.optional });
    if (row.childServiceId) {
      if (row.aftercare) aftercare.push(row.aftercare);
      const child = expand(row.childServiceId, components, visited);
      aftercare.push(...child.aftercare);
      for (const supply of child.supplies) supplies.push({ ...supply, quantity: round3(supply.quantity * quantity), optional: supply.optional || row.optional });
    }
  }
  return { supplies, aftercare };
}

/**
 * Suma de las líneas resueltas. Se calcula en centavos enteros: sumar los
 * decimales de Postgres como flotantes deja facturas «pagadas» con un peso
 * de diferencia.
 */
export function totalCents(resolved: ResolvedService[]): number {
  return resolved.reduce((sum, item) => sum + item.subtotalCents, 0);
}
