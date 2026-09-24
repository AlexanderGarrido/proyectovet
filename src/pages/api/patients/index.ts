import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { patients, owners, speciesEnum } from '../../../db/schema/patients';
import { eq, ilike, or, and, desc, sql } from 'drizzle-orm';
import { patientSchema, zodError } from '../../../lib/schemas';
import { jsonOkPaginated, jsonOk, jsonError } from '../../../lib/http';
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
  const speciesParam = url.searchParams.get('species');
  if (speciesParam && !speciesEnum.enumValues.includes(speciesParam as typeof speciesEnum.enumValues[number])) return jsonError(400, 'Especie inválida');
  const species = speciesParam as typeof speciesEnum.enumValues[number] | null;
  const ownerId = url.searchParams.get('ownerId');
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || '100')));
  const offset = (page - 1) * limit;

  // La búsqueda del encabezado es el camino más corto a una ficha en terreno:
  // muchas veces lo único que se tiene a mano es el teléfono del responsable
  // o su apellido, no el nombre del paciente. El join con `owners` ya existe
  // para el listado, así que ampliar el filtro no agrega consultas.
  const searchCondition = search
    ? or(
        ilike(patients.name, `%${search}%`),
        ilike(patients.breed, `%${search}%`),
        ilike(owners.firstName, `%${search}%`),
        ilike(owners.lastName, `%${search}%`),
        ilike(owners.phone, `%${search}%`)
      )
    : undefined;
  const whereCondition = and(
    ownerId ? eq(patients.ownerId, Number(ownerId)) : searchCondition,
    species ? eq(patients.species, species) : undefined,
  );

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
        ownerAddress: owners.address,
        hasPhoto: sql<boolean>`${patients.photo} IS NOT NULL`,
        updatedAt: patients.updatedAt,
      })
      .from(patients)
      .leftJoin(owners, eq(patients.ownerId, owners.id))
      .where(whereCondition)
      .orderBy(desc(patients.createdAt))
      .limit(limit)
      .offset(offset),
    // El conteo repite el join: el filtro puede referirse a columnas de
    // `owners` y sin la tabla la consulta ni siquiera es válida.
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(patients)
      .leftJoin(owners, eq(patients.ownerId, owners.id))
      .where(whereCondition),
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

  const { ownerId, name, species, breed, color, sex, notes, isActive, dateOfBirth, weight, microchipNumber, photo } = parsed.data;

  const [newPatient] = await db.insert(patients).values({
    ownerId, name, species, breed, color, sex, notes, isActive,
    dateOfBirth: dateOfBirth || null,
    weight: weight != null ? String(weight) : null,
    microchipNumber,
    photo: photo || null,
  }).returning();
  return jsonOk(newPatient, 201);
};
