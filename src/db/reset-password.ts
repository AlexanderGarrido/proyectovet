/**
 * Restablece la contraseña de una cuenta existente, directamente contra la base
 * de datos. Es la vía de rescate cuando nadie puede entrar al panel: el flujo
 * normal (PUT /api/users/[id]) exige estar autenticado como admin, y la
 * recuperación por email se retiró a propósito (commit 8884f71).
 *
 * Uso: npx tsx src/db/reset-password.ts <email>
 *
 * La contraseña se pide por consola con el eco apagado: no queda en el
 * historial del shell, ni en variables de entorno, ni en ningún archivo.
 *
 * Al terminar revoca todas las sesiones activas de esa cuenta, igual que hacía
 * el flujo de restablecimiento original.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as readline from 'node:readline';
import * as dotenv from 'dotenv';
import { users, accounts, sessions } from './schema/users';
import { hashPassword } from '../lib/password';

dotenv.config();

/** Lee una línea de stdin sin mostrar lo que se escribe. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let muted = false;

    // readline no tipa _writeToOutput, pero es la forma estándar de silenciar
    // el eco sin dependencias externas.
    (rl as unknown as { _writeToOutput: (chunk: string) => void })._writeToOutput = (chunk) => {
      if (!muted) process.stdout.write(chunk);
    };

    rl.question(question, (answer) => {
      muted = false;
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

async function run() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('❌ Falta el email.\n   Uso: npx tsx src/db/reset-password.ts <email>');
    process.exit(1);
  }

  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('❌ Falta DIRECT_URL (o DATABASE_URL) en el entorno.');
    process.exit(1);
  }

  const connection = postgres(url, { prepare: false });
  const db = drizzle(connection);

  try {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) {
      console.error(`❌ No existe ninguna cuenta con el email ${email}`);
      process.exit(1);
    }

    console.log(`\nCuenta: ${user.name} <${user.email}>`);
    console.log(`Rol: ${user.role}${user.isActive ? '' : '  ⚠️  (cuenta desactivada)'}\n`);

    const password = await askHidden('Contraseña nueva (no se muestra): ');
    const confirm = await askHidden('Repetir para confirmar: ');

    if (password.length < 8) {
      console.error('\n❌ La contraseña debe tener al menos 8 caracteres.');
      process.exit(1);
    }
    if (password !== confirm) {
      console.error('\n❌ Las dos contraseñas no coinciden. No se cambió nada.');
      process.exit(1);
    }

    const hashed = await hashPassword(password);

    const updated = await db
      .update(accounts)
      .set({ password: hashed, updatedAt: new Date() })
      .where(eq(accounts.userId, user.id))
      .returning({ id: accounts.id });

    if (updated.length === 0) {
      console.error(
        '\n❌ La cuenta no tiene credenciales asociadas (sin fila en accounts).\n' +
          '   Habría que crearla; revisa src/db/set-passwords.ts como referencia.',
      );
      process.exit(1);
    }

    // Cerrar todas las sesiones abiertas de esa cuenta.
    const revoked = await db
      .delete(sessions)
      .where(eq(sessions.userId, user.id))
      .returning({ id: sessions.id });

    console.log(`\n✅ Contraseña actualizada para ${user.email}`);
    console.log(`🔒 Sesiones revocadas: ${revoked.length}`);
    console.log('   Ya puedes entrar en /login con la contraseña nueva.\n');
  } finally {
    await connection.end();
  }
}

run().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});
