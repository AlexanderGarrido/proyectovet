import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db } from '../../../db';
import { appointments } from '../../../db/schema/appointments';
import { appointmentPlannedServices } from '../../../db/schema/services';
import { eq } from 'drizzle-orm';
import { jsonError, jsonOk } from '../../../lib/http';
import { requirePermission } from '../../../lib/guard';
import { parseJsonBody, zodError } from '../../../lib/schemas';
import { loadKit } from '../../../lib/kit';
import { VisitError } from '../../../lib/visit-operation';
import { clinicDay } from '../../../lib/clinic-time';

const planSchema = z.object({
  appointmentId: z.number().int().positive(),
  services: z.array(z.object({
    serviceId: z.number().int().positive(),
    quantity: z.number().finite().min(0.001).max(999),
  })).max(20),
});

/** Faltantes del botiquín para la jornada indicada. */
export const GET: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'inventory', 'read');
  if (guardErr) return guardErr;

  const day = new URL(request.url).searchParams.get('day') || clinicDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return jsonError(400, 'Fecha inválida');

  try {
    return jsonOk(await loadKit(user!, day), 200, { 'Cache-Control': 'private, no-store' });
  } catch (error) {
    if (error instanceof VisitError) return jsonError(error.status, error.message);
    throw error;
  }
};

/**
 * Declara qué prestaciones se prevén para una cita. Solo alimenta la
 * preparación del botiquín: no emite cobro, no descuenta stock y no entra
 * en la ficha. Reemplaza el plan completo de esa cita en cada llamada,
 * para que quitar una prestación sea posible sin un endpoint aparte.
 */
export const PUT: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'appointments', 'write');
  if (guardErr) return guardErr;

  const body = await parseJsonBody(request);
  if ('error' in body) return body.error;
  const parsed = planSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);

  const [visit] = await db.select({ id: appointments.id, veterinarianId: appointments.veterinarianId })
    .from(appointments).where(eq(appointments.id, parsed.data.appointmentId));
  if (!visit) return jsonError(404, 'Visita no encontrada');
  if (user!.role === 'veterinario' && visit.veterinarianId !== user!.id) return jsonError(403, 'Sin permiso sobre esta visita');

  await db.transaction(async (tx) => {
    await tx.delete(appointmentPlannedServices).where(eq(appointmentPlannedServices.appointmentId, visit.id));
    if (parsed.data.services.length) {
      await tx.insert(appointmentPlannedServices).values(parsed.data.services.map((s) => ({
        appointmentId: visit.id, serviceId: s.serviceId, quantity: s.quantity.toFixed(3), createdBy: user!.id,
      })));
    }
  });

  return jsonOk({ appointmentId: visit.id, planned: parsed.data.services.length });
};
