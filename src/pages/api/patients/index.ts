import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { patients, owners } from '../../../db/schema/patients';
import { eq, ilike, or, desc, sql } from 'drizzle-orm';
import { patientSchema, zodError } from '../../../lib/schemas';

const STAFF_ROLES = ['admin', 'veterinario', 'recepcionista'];

export const GET: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  if (!STAFF_ROLES.includes(user.role)) {
    return new Response(JSON.stringify({ error: 'Acceso denegado' }), { status: 403 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const ownerId = url.searchParams.get('ownerId');
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || '100')));
  const offset = (page - 1) * limit;

  const result = await db
    .select({
      id: patients.id,
      name: patients.name,
      species: patients.species,
      breed: patients.breed,
      sex: patients.sex,
      dateOfBirth: patients.dateOfBirth,
      weight: patients.weight,
      isActive: patients.isActive,
      ownerId: patients.ownerId,
      ownerFirstName: owners.firstName,
      ownerLastName: owners.lastName,
      ownerPhone: owners.phone,
      hasPhoto: sql<boolean>`${patients.photo} IS NOT NULL`,
      updatedAt: patients.updatedAt,
    })
    .from(patients)
    .leftJoin(owners, eq(patients.ownerId, owners.id))
    .where(
      ownerId
        ? eq(patients.ownerId, Number(ownerId))
        : search
        ? or(ilike(patients.name, `%${search}%`), ilike(patients.breed, `%${search}%`))
        : undefined
    )
    .orderBy(desc(patients.createdAt))
    .limit(limit)
    .offset(offset);

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  if (!STAFF_ROLES.includes(user.role)) {
    return new Response(JSON.stringify({ error: 'Sin permiso' }), { status: 403 });
  }

  const body = await request.json();
  const parsed = patientSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const { ownerId, name, species, breed, color, sex, dateOfBirth, weight, microchipNumber, photo } = parsed.data;

  const [newPatient] = await db.insert(patients).values({
    ownerId, name, species, breed, color, sex,
    dateOfBirth: dateOfBirth || null,
    weight: weight != null ? String(weight) : null,
    microchipNumber,
    photo: photo || null,
  }).returning();
  return new Response(JSON.stringify(newPatient), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
