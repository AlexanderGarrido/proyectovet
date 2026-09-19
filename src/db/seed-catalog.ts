import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import { services, serviceComponents } from './schema/services';
import { clinicalTemplates } from './schema/clinical';
import { products } from './schema/inventory';
import { BUILT_IN_TEMPLATES } from '../lib/clinical-templates';

dotenv.config();

/**
 * Catálogo inicial de prestaciones y plantillas.
 *
 * NO son datos de demostración: se escriben en la base real y fijan precios
 * que después se cobran. Es un punto de partida para revisar con el
 * veterinario antes de usarlo — los montos de aquí son marcadores de
 * posición, no una tarifa acordada.
 *
 * Es idempotente: si ya hay prestaciones cargadas no toca nada, para que
 * volver a ejecutarlo por error no duplique el catálogo ni pise precios
 * que alguien ya ajustó.
 */
const CATALOGO: { code: string; name: string; price: string; durationMinutes: number; aftercare?: string; supplies?: { sku?: string; name?: string; quantity: string; optional?: boolean }[] }[] = [
  {
    code: 'CONS-DOM', name: 'Consulta general a domicilio', price: '25000.00', durationMinutes: 40,
    aftercare: 'Revisar las indicaciones entregadas y consultar ante cualquier cambio.',
  },
  {
    code: 'CONTROL', name: 'Control de tratamiento', price: '15000.00', durationMinutes: 25,
    aftercare: 'Mantener el tratamiento según lo indicado hasta el próximo control.',
  },
  {
    code: 'VAC', name: 'Vacunación', price: '18000.00', durationMinutes: 20,
    aftercare: 'Observar el sitio de aplicación durante 48 horas.',
  },
  {
    code: 'DESPAR', name: 'Desparasitación', price: '12000.00', durationMinutes: 15,
    aftercare: 'Repetir según el calendario indicado.',
  },
  {
    code: 'TRASLADO', name: 'Traslado a domicilio', price: '6000.00', durationMinutes: 0,
  },
];

async function seedCatalog() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL (o DIRECT_URL) en el entorno');
  const connection = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(connection);

  const existing = await db.select({ id: services.id }).from(services).limit(1);
  if (existing.length) {
    console.log('El catálogo ya tiene prestaciones cargadas. No se modificó nada.');
    await connection.end();
    return;
  }

  const inventory = await db.select({ id: products.id, sku: products.sku, name: products.name }).from(products).limit(500);
  const findProduct = (ref: { sku?: string; name?: string }) =>
    inventory.find((p) => (ref.sku && p.sku === ref.sku) || (ref.name && p.name.toLowerCase().includes(ref.name.toLowerCase())));

  for (const item of CATALOGO) {
    const [created] = await db.insert(services).values({
      code: item.code, name: item.name, price: item.price,
      durationMinutes: item.durationMinutes, aftercare: item.aftercare ?? null,
    }).returning();

    for (const supply of item.supplies ?? []) {
      const product = findProduct(supply);
      // Sin producto no se inventa un vínculo: un componente que apunte al
      // insumo equivocado descontaría stock de otra cosa.
      if (!product) { console.warn(`  · Sin insumo coincidente para "${supply.sku ?? supply.name}" en ${item.code}`); continue; }
      await db.insert(serviceComponents).values({
        serviceId: created.id, productId: product.id, quantity: supply.quantity, optional: supply.optional ?? false,
      });
    }
    console.log(`Prestación creada: ${item.code} — ${item.name} ($${item.price})`);
  }

  const templateCount = await db.select({ id: clinicalTemplates.id }).from(clinicalTemplates).limit(1);
  if (!templateCount.length) {
    for (const template of BUILT_IN_TEMPLATES) {
      await db.insert(clinicalTemplates).values({
        name: template.name, visitType: template.visitType as never,
        sections: template.sections, phrases: template.phrases,
      });
      console.log(`Plantilla creada: ${template.name}`);
    }
  }

  console.log('\nRevisar precios y componentes con el veterinario antes del piloto.');
  console.log('Los montos cargados son marcadores de posición, no una tarifa acordada.');
  await connection.end();
}

seedCatalog().catch((error) => {
  console.error('No se pudo cargar el catálogo:', error instanceof Error ? error.message : error);
  process.exit(1);
});
