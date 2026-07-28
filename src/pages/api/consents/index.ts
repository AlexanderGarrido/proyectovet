import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { consentForms } from '../../../db/schema/consents';
import { patients, owners } from '../../../db/schema/patients';
import { eq, desc } from 'drizzle-orm';
import { consentFormSchema, zodError, parseJsonBody } from '../../../lib/schemas';
import { jsonError, jsonOk } from '../../../lib/http';
import { requirePermission } from '../../../lib/guard';

export const GET: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'consents', 'read');
  if (guardErr) return guardErr;

  const url = new URL(request.url);
  const patientId = url.searchParams.get('patientId');

  let query = db
    .select({
      id: consentForms.id,
      type: consentForms.type,
      description: consentForms.description,
      signedByName: consentForms.signedByName,
      createdAt: consentForms.createdAt,
      patientId: consentForms.patientId,
      patientName: patients.name,
      ownerFirstName: owners.firstName,
      ownerLastName: owners.lastName,
    })
    .from(consentForms)
    .leftJoin(patients, eq(consentForms.patientId, patients.id))
    .leftJoin(owners, eq(patients.ownerId, owners.id))
    .$dynamic();

  if (patientId) query = query.where(eq(consentForms.patientId, Number(patientId)));

  const result = await query.orderBy(desc(consentForms.createdAt));
  return jsonOk(result);
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'consents', 'write');
  if (guardErr) return guardErr;

  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const result = consentFormSchema.safeParse(parsed.data);
  if (!result.success) return zodError(result.error);
  const { patientId, type, description, signedByName, signedByRelation, signature } = result.data;

  const [patient] = await db.select({ id: patients.id }).from(patients).where(eq(patients.id, patientId));
  if (!patient) return jsonError(404, 'Paciente no encontrado');

  const [created] = await db.insert(consentForms).values({
    patientId,
    veterinarianId: user!.id,
    type,
    description,
    signedByName,
    signedByRelation: signedByRelation || null,
    signature,
  }).returning();

  return jsonOk(created, 201);
};
