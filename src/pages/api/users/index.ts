import type { APIRoute } from 'astro';
import * as crypto from 'crypto';
import { db } from '../../../db';
import { users, accounts } from '../../../db/schema/users';
import { eq } from 'drizzle-orm';
import { userCreateSchema, zodError, parseJsonBody } from '../../../lib/schemas';
import { hashPassword } from '../../../lib/password';
import { logAudit } from '../../../lib/audit';

const ADMIN_ONLY = ['admin'];

export const GET: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  if (!ADMIN_ONLY.includes(user.role)) {
    return new Response(JSON.stringify({ error: 'Acceso denegado' }), { status: 403 });
  }

  const url = new URL(request.url);
  const role = url.searchParams.get('role');
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || '100')));
  const offset = (page - 1) * limit;

  let query = db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    isActive: users.isActive,
  }).from(users).$dynamic();

  if (role) query = query.where(eq(users.role, role as any));

  const result = await query.limit(limit).offset(offset);
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
};

/**
 * Alta de un usuario del staff. Reemplaza el registro público self-service:
 * ahora solo un admin crea cuentas, con el rol fijado explícitamente. Escribe
 * `users` + `accounts` (proveedor `credential`) en una transacción, con el
 * mismo formato de hash que usa Better Auth (ver lib/password.ts).
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  if (!ADMIN_ONLY.includes(user.role)) {
    return new Response(JSON.stringify({ error: 'Acceso denegado' }), { status: 403 });
  }

  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const result = userCreateSchema.safeParse(parsed.data);
  if (!result.success) return zodError(result.error);
  const { name, email, password, role, phone } = result.data;

  const normalizedEmail = email.trim().toLowerCase();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail));
  if (existing) {
    return new Response(JSON.stringify({ error: 'Ya existe un usuario con ese correo' }), { status: 409 });
  }

  const userId = crypto.randomUUID();
  const hashed = await hashPassword(password);

  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: userId,
      name,
      email: normalizedEmail,
      emailVerified: true,
      role,
      phone: phone || null,
      isActive: true,
    });
    await tx.insert(accounts).values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: hashed,
    });
  });

  await logAudit({
    userId: user.id, userName: user.name, action: 'user.create',
    entityType: 'user', entityId: userId, metadata: { email: normalizedEmail, role },
  });

  return new Response(
    JSON.stringify({ id: userId, name, email: normalizedEmail, role, isActive: true }),
    { status: 201, headers: { 'Content-Type': 'application/json' } },
  );
};
