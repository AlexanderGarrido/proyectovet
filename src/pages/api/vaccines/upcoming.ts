import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { vaccines } from '../../../db/schema/medical';
import { patients, owners } from '../../../db/schema/patients';
import { eq, lte, isNotNull, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { requireUnscopedPermission } from '../../../lib/guard';

// SEGURIDAD (IDOR): antes solo exigía sesión — cualquier tutor autenticado
// podía listar TODAS las próximas dosis de vacunas de la clínica (nombre,
// teléfono de cada tutor). Es el widget operativo de recordatorios del
// dashboard de staff, no algo por-tutor — requireUnscopedPermission rechaza
// a tutor (solo tiene "vaccines:read:own") en vez de dejarlo pasar.
export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  const guardErr = requireUnscopedPermission(user, 'vaccines', 'read');
  if (guardErr) return guardErr;

  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);

  const result = await db
    .select({
      id: vaccines.id,
      vaccineName: vaccines.name,
      nextDoseDate: vaccines.nextDoseDate,
      patientId: vaccines.patientId,
      patientName: patients.name,
      patientSpecies: patients.species,
      ownerId: patients.ownerId,
      ownerFirstName: owners.firstName,
      ownerLastName: owners.lastName,
      ownerPhone: owners.phone,
    })
    .from(vaccines)
    .leftJoin(patients, eq(vaccines.patientId, patients.id))
    .leftJoin(owners, eq(patients.ownerId, owners.id))
    .where(
      and(
        isNotNull(vaccines.nextDoseDate),
        lte(vaccines.nextDoseDate, in30Days.toISOString().split('T')[0])
      )
    )
    .orderBy(vaccines.nextDoseDate);

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
};
