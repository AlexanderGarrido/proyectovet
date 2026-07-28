import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { owners, patients } from '../../../db/schema/patients';
import { ilike, or, desc, sql, inArray } from 'drizzle-orm';
import { ownerSchema, zodError } from '../../../lib/schemas';

const STAFF_ROLES = ['admin', 'veterinario', 'recepcionista'];

export const GET: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  if (!STAFF_ROLES.includes(user.role)) {
    return new Response(JSON.stringify({ error: 'Acceso denegado' }), { status: 403 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || '100')));
  const offset = (page - 1) * limit;

  let query = db.select().from(owners).$dynamic();
  if (search) {
    query = query.where(
      or(
        ilike(owners.firstName, `%${search}%`),
        ilike(owners.lastName, `%${search}%`),
        ilike(owners.email, `%${search}%`),
        ilike(owners.phone, `%${search}%`)
      )
    );
  }

  const result = await query.orderBy(desc(owners.createdAt)).limit(limit).offset(offset);

  // Conteo de mascotas activas por tutor, en una sola consulta agregada.
  const ids = result.map((o) => o.id);
  const counts = ids.length
    ? await db
        .select({ ownerId: patients.ownerId, count: sql<number>`count(*)::int` })
        .from(patients)
        .where(inArray(patients.ownerId, ids))
        .groupBy(patients.ownerId)
    : [];
  const countByOwner = new Map(counts.map((c) => [c.ownerId, c.count]));

  const withCounts = result.map((o) => ({ ...o, petCount: countByOwner.get(o.id) ?? 0 }));

  return new Response(JSON.stringify(withCounts), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });

  const body = await request.json();
  const parsed = ownerSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const { firstName, lastName, email, phone, address, documentId } = parsed.data;
  const [newOwner] = await db.insert(owners).values({
    firstName, lastName, email: email || null, phone: phone || null, address: address || null, documentId: documentId || null,
  }).returning();
  return new Response(JSON.stringify(newOwner), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
