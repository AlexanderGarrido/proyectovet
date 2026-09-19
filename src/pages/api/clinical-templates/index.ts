import type { APIRoute } from 'astro';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../../db';
import { clinicalTemplates } from '../../../db/schema/clinical';
import { jsonError, jsonOk } from '../../../lib/http';
import { requirePermission } from '../../../lib/guard';
import { parseJsonBody, zodError } from '../../../lib/schemas';
import { BUILT_IN_TEMPLATES, sanitizeSections, type TemplateShape } from '../../../lib/clinical-templates';

const VISIT_TYPES = ['consulta', 'vacunacion', 'cirugia', 'control', 'emergencia', 'desparasitacion', 'grooming'] as const;

const templateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  visitType: z.enum(VISIT_TYPES),
  sections: z.array(z.object({
    field: z.enum(['reason', 'subjective', 'diagnosis', 'treatment', 'observations']),
    label: z.string().trim().min(1).max(80),
    hint: z.string().trim().max(200).optional(),
    collapsed: z.boolean().optional(),
  })).min(1).max(12),
  phrases: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  /** Guardar como preferencia propia en vez de plantilla de la clínica. */
  personal: z.boolean().default(false),
});

/**
 * Plantillas disponibles para quien consulta: las de la clínica más sus
 * preferencias personales. Las incorporadas solo aparecen para los tipos
 * de visita que todavía no tienen ninguna definida, de modo que crear una
 * propia la reemplaza en vez de duplicarla.
 */
export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'medical-records', 'read');
  if (guardErr) return guardErr;

  const rows = await db.select().from(clinicalTemplates)
    .where(and(
      eq(clinicalTemplates.isActive, true),
      or(isNull(clinicalTemplates.ownerUserId), eq(clinicalTemplates.ownerUserId, user!.id)),
    ))
    .orderBy(asc(clinicalTemplates.visitType), asc(clinicalTemplates.name))
    .limit(200);

  const stored: TemplateShape[] = rows.map((row) => ({
    id: row.id, name: row.name, visitType: row.visitType, version: row.version,
    sections: sanitizeSections(row.sections), phrases: row.phrases ?? [],
    builtIn: false, ownerUserId: row.ownerUserId,
  }));
  const covered = new Set(stored.map((t) => t.visitType));
  const fallback = BUILT_IN_TEMPLATES.filter((t) => !covered.has(t.visitType));

  return jsonOk([...stored, ...fallback]);
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'medical-records', 'write');
  if (guardErr) return guardErr;

  const body = await parseJsonBody(request);
  if ('error' in body) return body.error;
  const parsed = templateSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);

  // Una plantilla de la clínica la define quien administra; un profesional
  // puede guardar su propia versión sin cambiársela al resto.
  if (!parsed.data.personal && user!.role !== 'admin') {
    return jsonError(403, 'Solo administración define plantillas de la clínica. Puedes guardarla como preferencia personal.');
  }

  const [created] = await db.insert(clinicalTemplates).values({
    name: parsed.data.name,
    visitType: parsed.data.visitType,
    sections: parsed.data.sections,
    phrases: parsed.data.phrases,
    ownerUserId: parsed.data.personal ? user!.id : null,
    createdBy: user!.id,
  }).returning();

  return jsonOk(created, 201);
};
