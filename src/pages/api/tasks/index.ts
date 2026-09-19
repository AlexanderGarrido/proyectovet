import type { APIRoute } from 'astro';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../../db';
import { followupTasks } from '../../../db/schema/followups';
import { jsonError, jsonOk } from '../../../lib/http';
import { requirePermission } from '../../../lib/guard';
import { parseJsonBody, zodError } from '../../../lib/schemas';
import { loadTasks, unclosedVisits } from '../../../lib/followups';

const createSchema = z.object({
  kind: z.enum(['consulta_por_cerrar', 'resultado_por_revisar', 'seguimiento', 'cobro_pendiente', 'contacto', 'otra']).default('otra'),
  title: z.string().trim().min(3).max(200),
  detail: z.string().trim().max(2000).optional(),
  patientId: z.number().int().positive().nullable().optional(),
  appointmentId: z.number().int().positive().nullable().optional(),
  assignedTo: z.string().max(36).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const updateSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(['pendiente', 'en_curso', 'completada', 'descartada']).optional(),
  assignedTo: z.string().max(36).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

/**
 * Bandeja de pendientes del día. Incluye además las visitas iniciadas sin
 * cerrar, que no son tareas guardadas sino un hecho de la agenda: es el
 * pendiente más caro de olvidar y no debería exigir ir a buscarlo.
 */
export const GET: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'appointments', 'read');
  if (guardErr) return guardErr;

  const url = new URL(request.url);
  const includeDone = url.searchParams.get('todas') === '1';

  const [tasks, unclosed] = await Promise.all([
    loadTasks(user!, { includeDone }),
    unclosedVisits(user!),
  ]);

  return jsonOk({ tasks, unclosed }, 200, { 'Cache-Control': 'private, no-store' });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'appointments', 'write');
  if (guardErr) return guardErr;

  const body = await parseJsonBody(request);
  if ('error' in body) return body.error;
  const parsed = createSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);

  const [created] = await db.insert(followupTasks).values({
    ...parsed.data,
    detail: parsed.data.detail ?? null,
    patientId: parsed.data.patientId ?? null,
    appointmentId: parsed.data.appointmentId ?? null,
    assignedTo: parsed.data.assignedTo ?? user!.id,
    dueDate: parsed.data.dueDate ?? null,
    // Sin clave de origen: es una tarea creada a mano, no derivada de un
    // hecho del sistema, así que nada la deduplica.
    sourceKey: null,
    createdBy: user!.id,
  }).returning();

  return jsonOk(created, 201);
};

export const PUT: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'appointments', 'write');
  if (guardErr) return guardErr;

  const body = await parseJsonBody(request);
  if ('error' in body) return body.error;
  const parsed = updateSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);
  const { id, status, assignedTo, dueDate } = parsed.data;

  const [existing] = await db.select().from(followupTasks).where(eq(followupTasks.id, id));
  if (!existing) return jsonError(404, 'Tarea no encontrada');
  // Un veterinario cierra lo suyo o lo que nadie tomó; repartir el trabajo
  // del equipo es de administración y recepción.
  if (user!.role === 'veterinario' && existing.assignedTo && existing.assignedTo !== user!.id) {
    return jsonError(403, 'Esta tarea está asignada a otra persona');
  }
  // Tomar una tarea sin dueño es una cosa; repartir el trabajo del equipo
  // es otra, y corresponde a administración y recepción.
  if (user!.role === 'veterinario' && assignedTo !== undefined && assignedTo !== null && assignedTo !== user!.id) {
    return jsonError(403, 'Solo puedes tomar una tarea para ti; reasignarla corresponde a administración o recepción');
  }

  const done = status === 'completada' || status === 'descartada';
  const [updated] = await db.update(followupTasks).set({
    ...(status !== undefined ? { status } : {}),
    ...(assignedTo !== undefined ? { assignedTo } : {}),
    ...(dueDate !== undefined ? { dueDate } : {}),
    ...(done ? { completedBy: user!.id, completedAt: new Date() } : {}),
    // Reabrir una tarea borra el cierre anterior: dejarlo sería afirmar
    // que alguien la completó cuando vuelve a estar pendiente.
    ...(status && !done ? { completedBy: null, completedAt: null } : {}),
  }).where(and(eq(followupTasks.id, id), inArray(followupTasks.status, ['pendiente', 'en_curso', 'completada', 'descartada']))).returning();

  return jsonOk(updated);
};
