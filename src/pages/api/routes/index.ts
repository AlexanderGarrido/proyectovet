import type { APIRoute } from 'astro';
import { z } from 'zod';
import { jsonError, jsonOk } from '../../../lib/http';
import { requirePermission } from '../../../lib/guard';
import { parseJsonBody, zodError } from '../../../lib/schemas';
import { createRouteStop, loadRoute, reorderStops } from '../../../lib/routes';
import { VisitError } from '../../../lib/visit-operation';
import { clinicDay } from '../../../lib/clinic-time';

const stopSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  veterinarianId: z.string().min(1).max(36),
  address: z.string().trim().min(3).max(500),
  sector: z.string().trim().max(80).nullable().optional(),
  visitAddressId: z.number().int().positive().nullable().optional(),
  travelMinutes: z.number().int().min(0).max(600).default(0),
  travelFee: z.number().finite().min(0).max(999999999).default(0),
  travelChargedTo: z.number().int().positive().nullable().optional(),
  appointmentIds: z.array(z.number().int().positive()).min(1).max(12),
});

const reorderSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  veterinarianId: z.string().min(1).max(36),
  stopIds: z.array(z.number().int().positive()).min(1).max(60),
});

export const GET: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'appointments', 'read');
  if (guardErr) return guardErr;

  const url = new URL(request.url);
  const day = url.searchParams.get('day') || clinicDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return jsonError(400, 'Fecha inválida');
  // Un veterinario solo planifica su propio recorrido; recepción y
  // administración pueden armar el de cualquiera del equipo.
  const veterinarianId = user!.role === 'veterinario' ? user!.id : (url.searchParams.get('veterinarianId') || user!.id);

  return jsonOk(await loadRoute(veterinarianId, day), 200, { 'Cache-Control': 'private, no-store' });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'appointments', 'write');
  if (guardErr) return guardErr;

  const body = await parseJsonBody(request);
  if ('error' in body) return body.error;
  const parsed = stopSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);
  if (user!.role === 'veterinario' && parsed.data.veterinarianId !== user!.id) return jsonError(403, 'Solo puedes armar tu propio recorrido');

  try {
    return jsonOk(await createRouteStop({ ...parsed.data, createdBy: user!.id }), 201);
  } catch (error) {
    if (error instanceof VisitError) return jsonError(error.status, error.message);
    throw error;
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'appointments', 'write');
  if (guardErr) return guardErr;

  const body = await parseJsonBody(request);
  if ('error' in body) return body.error;
  const parsed = reorderSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);
  if (user!.role === 'veterinario' && parsed.data.veterinarianId !== user!.id) return jsonError(403, 'Solo puedes reordenar tu propio recorrido');

  try {
    const count = await reorderStops(parsed.data.veterinarianId, parsed.data.day, parsed.data.stopIds);
    return jsonOk({ reordered: count });
  } catch (error) {
    if (error instanceof VisitError) return jsonError(error.status, error.message);
    throw error;
  }
};
