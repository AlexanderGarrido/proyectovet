import type { APIRoute } from 'astro';
import { jsonError, jsonOk } from '../../../../lib/http';
import { parseJsonBody, zodError } from '../../../../lib/schemas';
import { visitOperationSchema, VisitError } from '../../../../lib/visit-operation';
import { isVisitStaff } from '../../../../lib/visits';
import { saveVisit } from '../../../../lib/save-visit';

export const POST: APIRoute = async ({ locals, request, params }) => {
  const user = locals.user;
  if (!user) return jsonError(401, 'Tu sesión venció. Inicia sesión para sincronizar.');
  if (!isVisitStaff(user.role)) return jsonError(403, 'Sin permiso');
  if (request.headers.get('X-Field-User') !== user.id) return jsonError(401, 'Esta operación pertenece a otra sesión. Inicia sesión con la cuenta que preparó la jornada.');
  const body = await parseJsonBody(request);
  if ('error' in body) return body.error;
  const parsed = visitOperationSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);
  if (parsed.data.visitId !== Number(params.id)) return jsonError(400, 'La operación no corresponde a esta visita');
  try { return jsonOk(await saveVisit(user, parsed.data)); }
  catch (error) {
    if (error instanceof VisitError) return jsonError(error.status, error.message);
    console.error('No se pudo sincronizar la visita', error instanceof Error ? error.name : 'Error desconocido');
    return jsonError(503, 'No se pudo confirmar el guardado. Conserva la operación pendiente y vuelve a sincronizar.');
  }
};
