import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { owners } from '../../../../db/schema/patients';
import { ownerInvites } from '../../../../db/schema/invites';
import { eq, and, isNull } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { requirePermission } from '../../../../lib/guard';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

/**
 * Genera un link de invitación de un solo uso para que un tutor vincule su
 * cuenta a esta ficha de "owner". Reemplaza la vinculación automática por
 * coincidencia de email: solo el staff puede emitir esta invitación, y se
 * comparte por WhatsApp/email directamente con el tutor real.
 */
export const POST: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'owners', 'write');
  if (guardErr) return guardErr;

  const ownerId = Number(params.id);
  if (!ownerId || isNaN(ownerId) || ownerId <= 0) {
    return new Response(JSON.stringify({ error: 'ID inválido' }), { status: 400 });
  }

  const [owner] = await db.select({ id: owners.id, userId: owners.userId }).from(owners).where(eq(owners.id, ownerId));
  if (!owner) return new Response(JSON.stringify({ error: 'Tutor no encontrado' }), { status: 404 });
  if (owner.userId) {
    return new Response(JSON.stringify({ error: 'Este tutor ya tiene una cuenta vinculada' }), { status: 400 });
  }

  // Invalida invitaciones previas sin usar para esta ficha, para que solo el
  // link más reciente sea válido.
  await db.delete(ownerInvites).where(and(eq(ownerInvites.ownerId, ownerId), isNull(ownerInvites.usedAt)));

  const token = randomBytes(32).toString('hex');
  await db.insert(ownerInvites).values({
    token,
    ownerId,
    createdBy: user!.id,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });

  const baseUrl = (import.meta.env.BETTER_AUTH_URL || process.env.BETTER_AUTH_URL || '').replace(/\/$/, '');
  const url = `${baseUrl}/register?invite=${token}`;

  return new Response(JSON.stringify({ token, url, expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString() }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
