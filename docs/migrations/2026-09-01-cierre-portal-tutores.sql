-- ============================================================================
-- Cierre del portal de tutores — Fase 1
-- ============================================================================
-- Ejecutar UNA vez contra la base de datos (Supabase) por la conexión directa
-- (puerto 5432 / DIRECT_URL), no por el pooler.
--
-- Qué hace:
--   1. Elimina la tabla owner_invites (flujo de invitación retirado).
--   2. Desvincula las fichas de cliente (owners) de las cuentas de tutor.
--   3. Elimina las cuentas con rol 'tutor' (cascada a sessions y accounts).
--   4. Cambia el DEFAULT de users.role a 'recepcionista'.
--
-- El valor 'tutor' se deja en el enum `role` de Postgres a propósito: quitarlo
-- obliga a recrear el tipo y reescribir la columna, sin ganancia real.
--
-- Recomendado: correr `npm run db:backup` antes.
-- ============================================================================

BEGIN;

-- 1. Tabla del flujo de invitación
DROP TABLE IF EXISTS "owner_invites" CASCADE;

-- 2. Desvincular fichas de cliente de las cuentas de tutor
UPDATE "owners"
   SET "user_id" = NULL
 WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "role" = 'tutor');

-- 3. Eliminar las cuentas de tutor (sessions y accounts caen por ON DELETE CASCADE)
DELETE FROM "users" WHERE "role" = 'tutor';

-- 4. Nuevo DEFAULT del rol
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'recepcionista';

COMMIT;

-- Verificación (debe devolver 0 filas / NULL):
--   SELECT role, count(*) FROM users GROUP BY role;         -- sin 'tutor'
--   SELECT count(*) FROM owners WHERE user_id IS NOT NULL;  -- 0 (o solo staff real)
--   SELECT to_regclass('owner_invites');                    -- NULL
