import type { APIRoute } from 'astro';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../../db';
import { services, serviceComponents } from '../../../db/schema/services';
import { products } from '../../../db/schema/inventory';
import { jsonError, jsonOk } from '../../../lib/http';
import { requirePermission } from '../../../lib/guard';
import { parseJsonBody, zodError } from '../../../lib/schemas';
import { logAudit } from '../../../lib/audit';

const serviceSchema = z.object({
  code: z.string().trim().max(40).optional(),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional(),
  price: z.number().finite().min(0).max(999999999),
  durationMinutes: z.number().int().min(0).max(600).optional(),
  aftercare: z.string().trim().max(1000).optional(),
  isPackage: z.boolean().default(false),
  components: z.array(z.object({
    productId: z.number().int().positive().optional(),
    childServiceId: z.number().int().positive().optional(),
    quantity: z.number().finite().min(0.001).max(9999),
    optional: z.boolean().default(false),
  })).max(30).default([]),
});

/**
 * Catálogo de prestaciones para la pantalla de atención y para el
 * formulario general de cobro: ambos recorridos leen la misma fuente, que
 * es lo que evita que una atención se cobre distinto según dónde se
 * registre.
 */
export const GET: APIRoute = async ({ locals }) => {
  const guardErr = requirePermission(locals.user, 'invoices', 'read');
  if (guardErr) return guardErr;

  const rows = await db.select().from(services).where(eq(services.isActive, true)).orderBy(asc(services.name)).limit(300);
  if (!rows.length) return jsonOk([]);

  const componentRows = await db
    .select({
      serviceId: serviceComponents.serviceId, productId: serviceComponents.productId,
      childServiceId: serviceComponents.childServiceId, quantity: serviceComponents.quantity,
      optional: serviceComponents.optional, productName: products.name, productUnit: products.unit,
    })
    .from(serviceComponents)
    .leftJoin(products, eq(serviceComponents.productId, products.id))
    .where(inArray(serviceComponents.serviceId, rows.map((r) => r.id)));

  return jsonOk(rows.map((service) => ({
    id: service.id, code: service.code, name: service.name, description: service.description,
    price: service.price, durationMinutes: service.durationMinutes, aftercare: service.aftercare,
    isPackage: service.isPackage,
    components: componentRows.filter((c) => c.serviceId === service.id).map((c) => ({
      productId: c.productId, childServiceId: c.childServiceId, quantity: c.quantity,
      optional: c.optional, productName: c.productName, productUnit: c.productUnit,
    })),
  })));
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return jsonError(401, 'No autorizado');
  // El catálogo fija precios para toda la clínica; no es una preferencia
  // individual que cada profesional pueda cambiar desde una visita.
  if (user.role !== 'admin') return jsonError(403, 'Solo administración edita el catálogo de prestaciones');

  const body = await parseJsonBody(request);
  if ('error' in body) return body.error;
  const parsed = serviceSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);
  const { components, price, ...data } = parsed.data;

  if (components.some((c) => !c.productId === !c.childServiceId)) {
    return jsonError(400, 'Cada componente referencia un producto o una prestación, no ambos ni ninguno');
  }

  const created = await db.transaction(async (tx) => {
    const [service] = await tx.insert(services).values({
      ...data, price: price.toFixed(2), createdBy: user.id,
    }).returning();
    if (components.length) {
      // Un paquete que se contenga a sí mismo haría interminable la
      // expansión al cobrar; se rechaza al definirlo, no al usarlo.
      if (components.some((c) => c.childServiceId === service.id)) throw new Error('self-reference');
      await tx.insert(serviceComponents).values(components.map((c) => ({
        serviceId: service.id, productId: c.productId ?? null, childServiceId: c.childServiceId ?? null,
        quantity: c.quantity.toFixed(3), optional: c.optional,
      })));
    }
    return service;
  }).catch((error: Error) => {
    if (error.message === 'self-reference') return null;
    throw error;
  });

  if (!created) return jsonError(400, 'Una prestación no puede contenerse a sí misma');

  await logAudit({
    userId: user.id, userName: user.name, action: 'service.create',
    entityType: 'service', entityId: created.id, metadata: { name: created.name },
  });
  return jsonOk(created, 201);
};
