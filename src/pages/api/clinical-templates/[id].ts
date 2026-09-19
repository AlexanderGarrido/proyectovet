import type { APIRoute } from 'astro';
import { and, eq, or, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../../db';
import { clinicalTemplates } from '../../../db/schema/clinical';
import { jsonError, jsonOk } from '../../../lib/http';
import { requirePermission } from '../../../lib/guard';
import { parseJsonBody, zodError } from '../../../lib/schemas';

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  sections: z.array(z.object({
    field: z.enum(['reason', 'subjective', 'diagnosis', 'treatment', 'observations']),
    label: z.string().trim().min(1).max(80),
    hint: z.string().trim().max(200).optional(),
    collapsed: z.boolean().optional(),
  })).min(1).max(12).optional(),
  phrases: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Editar una plantilla sube su versión. Las notas ya escritas guardan la
 * versión con que se redactaron, así que un cambio de plantilla no altera
 * cómo se lee una consulta anterior.
 */
export const PUT: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'medical-records', 'write');
  if (guardErr) return guardErr;

  const id = Number(params.id);
  if (!id || !Number.isInteger(id) || id <= 0) return jsonError(400, 'ID inválido');

  const body = await parseJsonBody(request);
  if ('error' in body) return body.error;
  const parsed = updateSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);

  const [existing] = await db.select().from(clinicalTemplates).where(eq(clinicalTemplates.id, id));
  if (!existing) return jsonError(404, 'Plantilla no encontrada');
  // Nadie edita la preferencia personal de otro profesional; la plantilla
  // compartida de la clínica solo la cambia administración.
  const mine = existing.ownerUserId === user!.id;
  if (!mine && !(existing.ownerUserId === null && user!.role === 'admin')) return jsonError(403, 'Sin permiso sobre esta plantilla');

  const [updated] = await db.update(clinicalTemplates)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.sections !== undefined ? { sections: parsed.data.sections } : {}),
      ...(parsed.data.phrases !== undefined ? { phrases: parsed.data.phrases } : {}),
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      version: sql`${clinicalTemplates.version} + 1`,
    })
    .where(and(eq(clinicalTemplates.id, id), or(isNull(clinicalTemplates.ownerUserId), eq(clinicalTemplates.ownerUserId, user!.id))))
    .returning();

  if (!updated) return jsonError(404, 'Plantilla no encontrada');
  return jsonOk(updated);
};
