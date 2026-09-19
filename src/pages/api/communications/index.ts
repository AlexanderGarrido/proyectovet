import type { APIRoute } from 'astro';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../../db';
import { communicationEvents } from '../../../db/schema/followups';
import { users } from '../../../db/schema/users';
import { jsonError, jsonOk } from '../../../lib/http';
import { requirePermission } from '../../../lib/guard';
import { parseJsonBody, zodError } from '../../../lib/schemas';

const createSchema = z.object({
  patientId: z.number().int().positive().nullable().optional(),
  appointmentId: z.number().int().positive().nullable().optional(),
  taskId: z.number().int().positive().nullable().optional(),
  channel: z.enum(['whatsapp', 'llamada', 'correo', 'presencial', 'otro']),
  // Solo dos estados son declarables desde aquí. «entregado» exigiría una
  // integración que lo acredite; hoy no existe ninguna, y escribirlo a mano
  // sería registrar como hecho algo que nadie comprobó.
  status: z.enum(['preparado', 'enviado_manual', 'fallido']).default('preparado'),
  summary: z.string().trim().max(300).optional(),
  body: z.string().trim().max(4000).optional(),
});

export const GET: APIRoute = async ({ request, locals }) => {
  const guardErr = requirePermission(locals.user, 'appointments', 'read');
  if (guardErr) return guardErr;

  const url = new URL(request.url);
  const patientId = Number(url.searchParams.get('patientId'));
  if (!patientId || !Number.isInteger(patientId)) return jsonError(400, 'Falta el paciente');

  const rows = await db
    .select({
      id: communicationEvents.id, channel: communicationEvents.channel, status: communicationEvents.status,
      summary: communicationEvents.summary, createdAt: communicationEvents.createdAt, author: users.name,
    })
    .from(communicationEvents)
    .leftJoin(users, eq(communicationEvents.createdBy, users.id))
    .where(eq(communicationEvents.patientId, patientId))
    .orderBy(desc(communicationEvents.createdAt))
    .limit(50);

  return jsonOk(rows);
};

/**
 * Registra una comunicación asociada a la ficha. Es una declaración de
 * quien la hizo, no una prueba de entrega: abrir un enlace de WhatsApp no
 * envía nada y enviar no garantiza que el mensaje llegara.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'appointments', 'write');
  if (guardErr) return guardErr;

  const body = await parseJsonBody(request);
  if ('error' in body) return body.error;
  const parsed = createSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);

  const [created] = await db.insert(communicationEvents).values({
    patientId: parsed.data.patientId ?? null,
    appointmentId: parsed.data.appointmentId ?? null,
    taskId: parsed.data.taskId ?? null,
    channel: parsed.data.channel,
    status: parsed.data.status,
    summary: parsed.data.summary ?? null,
    body: parsed.data.body ?? null,
    createdBy: user!.id,
  }).returning();

  return jsonOk(created, 201);
};
