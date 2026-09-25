import type { APIRoute } from 'astro';
import { jsonError, jsonOk } from '../../../../lib/http';
import { VisitError } from '../../../../lib/visit-operation';
import { discardVisit } from '../../../../lib/discard-visit';
import { features } from '../../../../lib/features';

export const POST: APIRoute = async ({ locals, request, params }) => {
  if (!features.atencionSinCita) return jsonError(404, 'No encontrado');
  const user = locals.user;
  if (!user) return jsonError(401, 'Tu sesión venció. Inicia sesión para continuar.');
  if (request.headers.get('X-Field-User') !== user.id) return jsonError(401, 'Esta atención pertenece a otra sesión. Inicia sesión con la cuenta que la abrió.');
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, 'Visita inválida');
  try { return jsonOk(await discardVisit(user, id)); }
  catch (error) {
    if (error instanceof VisitError) return jsonError(error.status, error.message);
    console.error('No se pudo descartar la atención', error instanceof Error ? error.name : 'Error desconocido');
    return jsonError(503, 'No se pudo descartar la atención. Reintenta con señal.');
  }
};
