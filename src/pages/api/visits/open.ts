import type { APIRoute } from 'astro';
import { jsonError, jsonOk } from '../../../lib/http';
import { parseJsonBody, zodError } from '../../../lib/schemas';
import { openVisitSchema, VisitError } from '../../../lib/visit-operation';
import { openVisit } from '../../../lib/open-visit';
import { features } from '../../../lib/features';

export const POST: APIRoute = async ({ locals, request }) => {
  if (!features.atencionSinCita) return jsonError(404, 'No encontrado');
  const user = locals.user;
  if (!user) return jsonError(401, 'Tu sesión venció. Inicia sesión para sincronizar.');
  if (request.headers.get('X-Field-User') !== user.id) return jsonError(401, 'Esta operación pertenece a otra sesión. Inicia sesión con la cuenta que la registró.');
  const body = await parseJsonBody(request);
  if ('error' in body) return body.error;
  const parsed = openVisitSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);
  try { return jsonOk(await openVisit(user, parsed.data)); }
  catch (error) {
    if (error instanceof VisitError) return jsonError(error.status, error.message);
    console.error('No se pudo abrir la atención', error instanceof Error ? error.name : 'Error desconocido');
    return jsonError(503, 'No se pudo confirmar la apertura. Conserva la operación pendiente y vuelve a sincronizar.');
  }
};
