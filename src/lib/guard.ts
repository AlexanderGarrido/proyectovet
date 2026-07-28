import { hasPermission } from './permissions';
import { jsonError } from './http';
import type { UserRole } from '../db/schema/users';

type GuardUser = { id: string; role: UserRole } | null | undefined;

/**
 * Verifica sesión + permiso de rol para un recurso/acción. Devuelve un
 * Response de error (401/403) si no está autorizado, o null si puede continuar.
 *
 * Uso: const err = requirePermission(locals.user, 'appointments', 'write');
 *      if (err) return err;
 */
export function requirePermission(
  user: GuardUser,
  resource: string,
  action: string
): Response | null {
  if (!user) return jsonError(401, 'No autorizado');
  if (!hasPermission(user.role, resource, action)) {
    return jsonError(403, 'Sin permiso');
  }
  return null;
}
