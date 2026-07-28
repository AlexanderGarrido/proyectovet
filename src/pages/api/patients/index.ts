import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { patients, owners } from '../../../db/schema/patients';
import { eq, ilike, or, desc, sql } from 'drizzle-orm';
import { patientSchema, zodError } from '../../../lib/schemas';
import { jsonOkPaginated, jsonOk } from '../../../lib/http';
import { requirePermission, requireUnscopedPermission } from '../../../lib/guard';

export const GET: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  // Este listado no filtra por pertenencia — no puede dejar pasar a un
  // tutor (que solo tiene "patients:read:own"), o vería todos los pacientes
  // de la clínica, no solo los suyos.
  const guardErr = requireUnscopedPermission(user, 'patients', 'read');
  if (guardErr) return guardErr;

  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const ownerId = url.searchParams.get('ownerId');
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || '100')));
  const offset = (page - 1) * limit;

  const whereCondition = ownerId
    ? eq(patients.ownerId, Number(ownerId))
    : search
    ? or(ilike(patients.name, `%${search}%`), ilike(patients.breed, `%${search}%`))
    : undefined;

  const [result, [{ count }]] = await Promise.all([
    db
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
      .where(whereCondition)
      .orderBy(desc(patients.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(patients).where(whereCondition),
  ]);

  return jsonOkPaginated(result, count);
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'patients', 'write');
  if (guardErr) return guardErr;

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
  return jsonOk(newPatient, 201);
};
