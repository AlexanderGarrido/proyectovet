import type { APIRoute } from 'astro';
import { loadDay, isVisitStaff } from '../../../../lib/visits';
import { jsonError, jsonOk } from '../../../../lib/http';

export const GET: APIRoute = async ({ locals, params }) => {
  const user = locals.user;
  if (!user) return jsonError(401, 'Inicia sesión para abrir la visita');
  if (!isVisitStaff(user.role)) return jsonError(403, 'Sin permiso');
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) return jsonError(400, 'Visita inválida');
  const data = await loadDay(user, undefined, id);
  if (!data.visits.length) return jsonError(404, 'Visita no encontrada');
  return jsonOk(data, 200, { 'Cache-Control': 'private, no-store' });
};
