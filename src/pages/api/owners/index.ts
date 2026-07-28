import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { owners, patients } from '../../../db/schema/patients';
import { ilike, or, desc, sql, inArray } from 'drizzle-orm';
import { ownerSchema, zodError } from '../../../lib/schemas';
import { jsonOkPaginated, jsonOk } from '../../../lib/http';
import { requirePermission } from '../../../lib/guard';

export const GET: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'owners', 'read');
  if (guardErr) return guardErr;

  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || '100')));
  const offset = (page - 1) * limit;

  const whereCondition = search
    ? or(
        ilike(owners.firstName, `%${search}%`),
        ilike(owners.lastName, `%${search}%`),
        ilike(owners.email, `%${search}%`),
        ilike(owners.phone, `%${search}%`)
      )
    : undefined;

  let query = db.select().from(owners).$dynamic();
  if (whereCondition) query = query.where(whereCondition);

  const [result, [{ count }]] = await Promise.all([
    query.orderBy(desc(owners.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(owners).where(whereCondition),
  ]);

  // Conteo de mascotas activas por tutor, en una sola consulta agregada.
  const ids = result.map((o) => o.id);
  const petCounts = ids.length
    ? await db
        .select({ ownerId: patients.ownerId, count: sql<number>`count(*)::int` })
        .from(patients)
        .where(inArray(patients.ownerId, ids))
        .groupBy(patients.ownerId)
    : [];
  const countByOwner = new Map(petCounts.map((c) => [c.ownerId, c.count]));

  const withCounts = result.map((o) => ({ ...o, petCount: countByOwner.get(o.id) ?? 0 }));

  return jsonOkPaginated(withCounts, count);
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  // SEGURIDAD: antes cualquier usuario autenticado (incluido un tutor) podía
  // crear fichas de tutor arbitrarias — sin ningún chequeo de rol.
  const guardErr = requirePermission(user, 'owners', 'write');
  if (guardErr) return guardErr;

  const body = await request.json();
  const parsed = ownerSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const { firstName, lastName, email, phone, address, documentId } = parsed.data;
  const [newOwner] = await db.insert(owners).values({
    firstName, lastName, email: email || null, phone: phone || null, address: address || null, documentId: documentId || null,
  }).returning();
  return jsonOk(newOwner, 201);
};
