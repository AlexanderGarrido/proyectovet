import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { patients } from '../../../../db/schema/patients';
import { eq } from 'drizzle-orm';
import { jsonError, jsonOk } from '../../../../lib/http';
import { requireUnscopedPermission } from '../../../../lib/guard';
import { loadTimeline, TIMELINE_KINDS, type TimelineKind } from '../../../../lib/timeline';

/**
 * Cronología del paciente. El filtro por tipo llega del cliente pero el
 * conjunto permitido lo decide el servidor según el rol: recepción no debe
 * poder pedir `consulta` y recibirla solo porque la interfaz no le ofrezca
 * el botón.
 */
export const GET: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  const guardErr = requireUnscopedPermission(user, 'patients', 'read');
  if (guardErr) return guardErr;

  const id = Number(params.id);
  if (!id || !Number.isInteger(id) || id <= 0) return jsonError(400, 'ID inválido');

  const [patient] = await db.select({ id: patients.id }).from(patients).where(eq(patients.id, id));
  if (!patient) return jsonError(404, 'Paciente no encontrado');

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') || '25');
  const cursor = url.searchParams.get('cursor') || undefined;
  const requested = (url.searchParams.get('kinds') || '')
    .split(',')
    .map((k) => k.trim())
    .filter((k): k is TimelineKind => (TIMELINE_KINDS as readonly string[]).includes(k));

  const page = await loadTimeline(id, user!.role, { limit: Number.isFinite(limit) ? limit : 25, cursor, kinds: requested });
  return jsonOk(page, 200, { 'Cache-Control': 'private, no-store' });
};
