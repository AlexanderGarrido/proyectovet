import type { APIRoute } from 'astro';
import { loadDay, isVisitStaff } from '../../lib/visits';
import { jsonError, jsonOk } from '../../lib/http';
import { clinicDay } from '../../lib/clinic-time';

export const GET: APIRoute = async ({ locals, url }) => {
  const user = locals.user;
  if (!user) return jsonError(401, 'Inicia sesión para preparar tu jornada');
  if (!isVisitStaff(user.role)) return jsonError(403, 'Sin permiso');
  // ?directorio=1 lo pide solo «Preparar sin conexión»: el directorio de
  // pacientes es para atender sin cita sin señal, no para cada sincronización.
  const directory = url.searchParams.get('directorio') === '1';
  return jsonOk(await loadDay(user, clinicDay(), undefined, { directory }), 200, { 'Cache-Control': 'private, no-store' });
};
