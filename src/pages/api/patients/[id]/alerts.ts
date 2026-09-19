import type { APIRoute } from 'astro';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../../../db';
import { patients } from '../../../../db/schema/patients';
import { patientAlerts } from '../../../../db/schema/clinical';
import { users } from '../../../../db/schema/users';
import { jsonError, jsonOk } from '../../../../lib/http';
import { requirePermission, requireUnscopedPermission } from '../../../../lib/guard';
import { hasPermission } from '../../../../lib/permissions';
import { parseJsonBody, zodError } from '../../../../lib/schemas';
import { logAudit } from '../../../../lib/audit';

const alertSchema = z.object({
  category: z.enum(['alergia', 'conducta', 'condicion', 'medicacion', 'administrativa']),
  text: z.string().trim().min(3).max(300),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

function patientId(raw: string | undefined): number | null {
  const id = Number(raw);
  return id && Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Categorías que puede leer quien no tiene acceso clínico.
 *
 * Que un paciente muerda o que haya un acuerdo administrativo pendiente es
 * información operativa: recepción la necesita para agendar y para avisar
 * a quien va a la casa. Una alergia, una condición o una medicación son
 * hallazgos clínicos y siguen la misma regla que la cronología, donde
 * recepción tampoco ve consultas ni recetas.
 */
const CATEGORIAS_OPERATIVAS = ['conducta', 'administrativa'] as const;

export const GET: APIRoute = async ({ params, request, locals }) => {
  const guardErr = requireUnscopedPermission(locals.user, 'patients', 'read');
  if (guardErr) return guardErr;
  const id = patientId(params.id);
  if (!id) return jsonError(400, 'ID inválido');
  const clinical = hasPermission(locals.user!.role, 'medical-records', 'read');

  // Por omisión solo las vigentes; el historial completo se pide aparte,
  // porque una alerta resuelta sigue siendo un antecedente.
  const includeResolved = new URL(request.url).searchParams.get('todas') === '1';
  const rows = await db
    .select({
      id: patientAlerts.id, category: patientAlerts.category, text: patientAlerts.text,
      validUntil: patientAlerts.validUntil, createdAt: patientAlerts.createdAt,
      resolvedAt: patientAlerts.resolvedAt, author: users.name,
    })
    .from(patientAlerts)
    .leftJoin(users, eq(patientAlerts.createdBy, users.id))
    .where(and(eq(patientAlerts.patientId, id), includeResolved ? undefined : isNull(patientAlerts.resolvedAt)))
    .orderBy(desc(patientAlerts.createdAt))
    .limit(50);

  // El filtro se aplica aquí y no en la interfaz: un cliente que pida el
  // listado directamente tampoco debe recibir lo clínico.
  return jsonOk(clinical ? rows : rows.filter((row) => (CATEGORIAS_OPERATIVAS as readonly string[]).includes(row.category)));
};

export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  // Registrar una alerta clínica es un acto profesional, no administrativo.
  const guardErr = requirePermission(user, 'medical-records', 'write');
  if (guardErr) return guardErr;
  const id = patientId(params.id);
  if (!id) return jsonError(400, 'ID inválido');

  const body = await parseJsonBody(request);
  if ('error' in body) return body.error;
  const parsed = alertSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);

  const [patient] = await db.select({ id: patients.id }).from(patients).where(eq(patients.id, id));
  if (!patient) return jsonError(404, 'Paciente no encontrado');

  const [created] = await db.insert(patientAlerts).values({
    patientId: id, category: parsed.data.category, text: parsed.data.text,
    validUntil: parsed.data.validUntil ?? null, createdBy: user!.id,
  }).returning();

  await logAudit({
    userId: user!.id, userName: user!.name, action: 'patient-alert.create',
    entityType: 'patient', entityId: id, metadata: { category: parsed.data.category },
  });
  return jsonOk(created, 201);
};

/** Retirar una alerta la marca resuelta con autor y fecha; no la borra. */
export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'medical-records', 'write');
  if (guardErr) return guardErr;
  const id = patientId(params.id);
  if (!id) return jsonError(400, 'ID inválido');

  const alertId = Number(new URL(request.url).searchParams.get('alertId'));
  if (!alertId || !Number.isInteger(alertId)) return jsonError(400, 'Falta la alerta a resolver');

  const [updated] = await db.update(patientAlerts)
    .set({ resolvedAt: new Date(), resolvedBy: user!.id })
    .where(and(eq(patientAlerts.id, alertId), eq(patientAlerts.patientId, id), isNull(patientAlerts.resolvedAt)))
    .returning();
  if (!updated) return jsonError(404, 'La alerta no existe o ya estaba resuelta');

  await logAudit({
    userId: user!.id, userName: user!.name, action: 'patient-alert.resolve',
    entityType: 'patient', entityId: id, metadata: { alertId },
  });
  return jsonOk(updated);
};
