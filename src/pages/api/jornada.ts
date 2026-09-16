import type { APIRoute } from 'astro';
import { loadDay, isVisitStaff } from '../../lib/visits';
import { jsonError, jsonOk } from '../../lib/http';
import { clinicDay } from '../../lib/clinic-time';

export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) return jsonError(401, 'Inicia sesión para preparar tu jornada');
  if (!isVisitStaff(user.role)) return jsonError(403, 'Sin permiso');
  return jsonOk(await loadDay(user, clinicDay()), 200, { 'Cache-Control': 'private, no-store' });
};
