import { db } from '../db';
import { owners, patients } from '../db/schema/patients';
import { patientCoOwners } from '../db/schema/co-owners';
import { eq, and } from 'drizzle-orm';

/** Ficha de tutor (owner) vinculada a la cuenta de este usuario, o null si no tiene. */
export async function getOwnerIdForUser(userId: string): Promise<number | null> {
  const [owner] = await db.select({ id: owners.id }).from(owners).where(eq(owners.userId, userId));
  return owner?.id ?? null;
}

/**
 * ¿Puede este tutor (por su userId) acceder al paciente `patientId`? Cierto
 * si es su tutor principal O co-tutor — el mismo criterio que ya usa el
 * portal del tutor (client/portal.ts) para decidir qué mascotas mostrar.
 *
 * Centraliza un chequeo que antes faltaba por completo en algunos endpoints
 * (ej. GET /api/vaccines, GET /api/patients/[id]/co-owners) — cualquier
 * tutor autenticado podía consultarlos para el patientId de otra persona.
 */
export async function canTutorAccessPatient(userId: string, patientId: number): Promise<boolean> {
  const ownerId = await getOwnerIdForUser(userId);
  if (ownerId === null) return false;

  const [patient] = await db.select({ ownerId: patients.ownerId }).from(patients).where(eq(patients.id, patientId));
  if (!patient) return false;
  if (patient.ownerId === ownerId) return true;

  const [coOwner] = await db
    .select({ id: patientCoOwners.id })
    .from(patientCoOwners)
    .where(and(eq(patientCoOwners.patientId, patientId), eq(patientCoOwners.ownerId, ownerId)));
  return !!coOwner;
}
