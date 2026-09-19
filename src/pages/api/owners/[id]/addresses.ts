import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../../../db';
import { owners } from '../../../../db/schema/patients';
import { visitAddresses } from '../../../../db/schema/routes';
import { jsonError, jsonOk } from '../../../../lib/http';
import { requirePermission } from '../../../../lib/guard';
import { parseJsonBody, zodError } from '../../../../lib/schemas';
import { listAddresses } from '../../../../lib/routes';

const addressSchema = z.object({
  label: z.string().trim().max(80).optional(),
  address: z.string().trim().min(3).max(500),
  accessNotes: z.string().trim().max(500).optional(),
  sector: z.string().trim().max(80).optional(),
});

function ownerId(raw: string | undefined): number | null {
  const id = Number(raw);
  return id && Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Domicilios guardados del responsable. La cita sigue guardando su propia
 * dirección: editar este registro no reescribe dónde se atendió antes.
 */
export const GET: APIRoute = async ({ params, locals }) => {
  const guardErr = requirePermission(locals.user, 'owners', 'read');
  if (guardErr) return guardErr;
  const id = ownerId(params.id);
  if (!id) return jsonError(400, 'ID inválido');
  return jsonOk(await listAddresses(id));
};

export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'owners', 'write');
  if (guardErr) return guardErr;
  const id = ownerId(params.id);
  if (!id) return jsonError(400, 'ID inválido');

  const body = await parseJsonBody(request);
  if ('error' in body) return body.error;
  const parsed = addressSchema.safeParse(body.data);
  if (!parsed.success) return zodError(parsed.error);

  const [owner] = await db.select({ id: owners.id }).from(owners).where(eq(owners.id, id));
  if (!owner) return jsonError(404, 'Responsable no encontrado');

  const [created] = await db.insert(visitAddresses).values({
    ownerId: id, label: parsed.data.label ?? null, address: parsed.data.address,
    accessNotes: parsed.data.accessNotes ?? null, sector: parsed.data.sector ?? null,
  }).returning();
  return jsonOk(created, 201);
};

/** Desactiva un domicilio guardado; las citas pasadas conservan el suyo. */
export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const guardErr = requirePermission(locals.user, 'owners', 'write');
  if (guardErr) return guardErr;
  const id = ownerId(params.id);
  if (!id) return jsonError(400, 'ID inválido');

  const addressId = Number(new URL(request.url).searchParams.get('addressId'));
  if (!addressId || !Number.isInteger(addressId)) return jsonError(400, 'Falta el domicilio');

  const [updated] = await db.update(visitAddresses).set({ isActive: false })
    .where(and(eq(visitAddresses.id, addressId), eq(visitAddresses.ownerId, id)))
    .returning();
  if (!updated) return jsonError(404, 'Domicilio no encontrado');
  return jsonOk({ success: true });
};
