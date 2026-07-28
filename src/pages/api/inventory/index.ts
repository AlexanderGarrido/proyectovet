import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { products, stockMovements } from '../../../db/schema/inventory';
import { eq, ilike, or, lte, desc, and } from 'drizzle-orm';

export const GET: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });

  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const category = url.searchParams.get('category') || '';
  const lowStock = url.searchParams.get('lowStock') === 'true';
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || '100')));
  const offset = (page - 1) * limit;

  let query = db.select().from(products).$dynamic();

  const conditions = [eq(products.isActive, true)];
  if (search) conditions.push(or(ilike(products.name, `%${search}%`), ilike(products.sku, `%${search}%`)) as any);
  if (category) conditions.push(eq(products.category, category as any));

  query = query.where(and(...conditions));

  if (lowStock) {
    query = (db.select().from(products) as any)
      .where(and(eq(products.isActive, true), lte(products.stock, products.minStock)));
  }

  const result = await query.orderBy(desc(products.updatedAt)).limit(limit).offset(offset);
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  if (user.role !== 'admin' && user.role !== 'recepcionista') {
    return new Response(JSON.stringify({ error: 'Sin permiso' }), { status: 403 });
  }

  const body = await request.json();
  const { name, description, category, sku, barcode, unitPrice, costPrice, stock, minStock, unit, expirationDate, supplier } = body;

  if (!name || !category || !unitPrice) {
    return new Response(JSON.stringify({ error: 'Nombre, categoría y precio son requeridos' }), { status: 400 });
  }

  const [newProduct] = await db.insert(products).values({
    name, description, category, sku, barcode,
    unitPrice: String(unitPrice),
    costPrice: costPrice ? String(costPrice) : null,
    stock: String(Number(stock) || 0),
    minStock: String(Number(minStock) || 5),
    unit: unit || 'unidad',
    expirationDate: expirationDate || null,
    supplier,
  }).returning();

  if (newProduct?.id && Number(stock) > 0) {
    await db.insert(stockMovements).values({
      productId: newProduct.id,
      type: 'entrada',
      quantity: String(Number(stock)),
      reason: 'Stock inicial',
      userId: user.id,
    });
  }
  return new Response(JSON.stringify(newProduct), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
