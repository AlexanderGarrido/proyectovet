import { hasPermission, requiresOwnershipCheck } from './permissions';
import { jsonError } from './http';
import type { UserRole } from '../db/schema/users';

type GuardUser = { id: string; role: UserRole } | null | undefined;

/**
 * Verifica sesión + permiso de rol para un recurso/acción. Devuelve un
 * Response de error (401/403) si no está autorizado, o null si puede continuar.
 *
 * OJO: `hasPermission` da por válida la variante ":own" (ej. un tutor tiene
 * "patients:read:own"). Si el endpoint que llama a este guard NO filtra los
 * resultados por pertenencia, usar `requireUnscopedPermission` en su lugar
 * — si no, un rol con acceso solo a "lo suyo" terminaría viendo el listado
 * completo de todos los registros.
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

/**
 * Igual que requirePermission, pero además rechaza a cualquier rol cuyo
 * acceso a este recurso/acción sea SOLO vía la variante ":own" — pensado
 * para listados sin filtro de pertenencia (ej. GET /api/patients devuelve
 * TODOS los pacientes; un tutor con "patients:read:own" no debe pasar aquí,
 * a diferencia de un endpoint que sí filtra por su ownerId, como
 * GET /api/appointments).
 */
export function requireUnscopedPermission(
  user: GuardUser,
  resource: string,
  action: string
): Response | null {
  const err = requirePermission(user, resource, action);
  if (err) return err;
  if (requiresOwnershipCheck(user!.role, resource, action)) {
    return jsonError(403, 'Sin permiso');
  }
  return null;
}
