import type { APIRoute } from 'astro';
import { getPortalData } from '../../../lib/portalData';
import { jsonError, jsonOk } from '../../../lib/http';

export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) return jsonError(401, 'No autorizado');
  if (user.role !== 'tutor') return jsonError(403, 'Acceso restringido');

  const data = await getPortalData(user.id);
  return jsonOk(data);
};
