import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db';
import { users, sessions, accounts, verifications } from '../db/schema/users';

const appUrl = process.env.BETTER_AUTH_URL || 'http://localhost:4321';
const isProduction = process.env.NODE_ENV === 'production';

// Orígenes de confianza: la URL pública configurada + localhost solo fuera de
// producción. Se pueden añadir más vía BETTER_AUTH_TRUSTED_ORIGINS (separados por coma).
const trustedOrigins = [
  appUrl,
  ...(isProduction ? [] : ['http://localhost:4321', 'http://localhost:4322']),
  ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? []),
];

export const auth = betterAuth({
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

export type Session = typeof auth.$Infer.Session;
