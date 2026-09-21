import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db';
import { users, sessions, accounts, verifications } from '../db/schema/users';

/**
 * La instancia se construye la primera vez que alguien la pide, no al
 * importar el módulo.
 *
 * Con la construcción en el ámbito del módulo, cualquier archivo que
 * importara este —el middleware lo hace— exigía `BETTER_AUTH_SECRET` en
 * tiempo de compilación. El build de Astro prerenderiza `/sin-conexion`,
 * una página pública que no toca la sesión, y aun así fallaba: obligaba a
 * tener disponibles al construir los secretos que solo hacen falta al
 * ejecutar.
 *
 * Diferirlo no relaja ninguna comprobación. Si falta el secreto,
 * better-auth se sigue negando a arrancar; lo hace en la primera petición
 * real en vez de al compilar. Las variables de entorno también se leen
 * aquí dentro, así que valen las del entorno de ejecución y no las que
 * hubiera durante el build.
 */
function createAuth() {
  const appUrl = process.env.BETTER_AUTH_URL || 'http://localhost:4321';
  const isProduction = process.env.NODE_ENV === 'production';

  // Orígenes de confianza: la URL pública configurada + localhost solo fuera de
  // producción. Se pueden añadir más vía BETTER_AUTH_TRUSTED_ORIGINS (separados por coma).
  const trustedOrigins = [
    appUrl,
    ...(isProduction ? [] : ['http://localhost:4321', 'http://localhost:4322']),
    ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? []),
  ];

  return betterAuth({
    baseURL: appUrl,
    trustedOrigins,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      // El registro es solo interno: un admin crea las cuentas de staff desde el
      // panel de Usuarios (POST /api/users). No hay alta self-service.
      disableSignUp: true,
      // No hay recuperación de contraseña por email (sin dominio/SMTP verificado).
      // Si un usuario olvida su contraseña, un administrador se la restablece
      // desde el panel de Usuarios (PUT /api/users/[id] con campo `password`).
    },
    user: {
      additionalFields: {
        role: {
          type: 'string',
          required: false,
          defaultValue: 'recepcionista',
          // SEGURIDAD: input:false evita que un usuario asigne su propio rol
          // durante el registro (escalada de privilegios). Los roles solo se
          // cambian desde el panel de administración.
          input: false,
        },
        phone: {
          type: 'string',
          required: false,
          input: true,
        },
        // input:false — solo se cambia desde el panel de admin (desactivar/activar).
        isActive: {
          type: 'boolean',
          required: false,
          defaultValue: true,
          input: false,
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 días: sesión completa antes de exigir volver a iniciar sesión.
      updateAge: 60 * 60 * 24, // se renueva si hay actividad al menos una vez al día.
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 minutes
      },
    },
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

/** Instancia compartida de better-auth; se construye una sola vez por proceso. */
export function getAuth(): ReturnType<typeof createAuth> {
  instance ??= createAuth();
  return instance;
}

export type Session = ReturnType<typeof createAuth>['$Infer']['Session'];
