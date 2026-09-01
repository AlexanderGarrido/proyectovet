/**
 * Script para establecer contraseñas a los usuarios creados por el seed.
 * Uso: npx tsx src/db/set-passwords.ts
 * Con Railway: railway run npx tsx src/db/set-passwords.ts
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { users, accounts } from './schema/users';
import { eq } from 'drizzle-orm';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { scryptAsync } from '@noble/hashes/scrypt.js';

dotenv.config();

// Replicar exactamente el formato de Better Auth
async function hashPassword(password: string): Promise<string> {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = Buffer.from(saltBytes).toString('hex');

  const key = await scryptAsync(password.normalize('NFKC'), salt, {
    N: 16384,
    r: 16,
    p: 1,
    dkLen: 64,
  });

  return `${salt}:${Buffer.from(key).toString('hex')}`;
}

const SEED_EMAILS = [
  'admin@vetclinic.com',
  'veterinario@vetclinic.com',
  'vet2@vetclinic.com',
  'recepcion@vetclinic.com',
];

// Contraseña por defecto para todos los usuarios del seed
const DEFAULT_PASSWORD = 'Vet2026!';

async function run() {
  const connection = postgres(process.env.DIRECT_URL || process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(connection);

  console.log('🔑 Estableciendo contraseñas para usuarios del seed...\n');

  for (const email of SEED_EMAILS) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) {
      console.log(`⚠️  Usuario no encontrado: ${email}`);
      continue;
    }

    // Verificar si ya tiene cuenta
    const existing = await db.select().from(accounts).where(eq(accounts.userId, user.id));
    if (existing.length > 0) {
      console.log(`✅ Ya tiene contraseña: ${email}`);
      continue;
    }

    const hashed = await hashPassword(DEFAULT_PASSWORD);

    await db.insert(accounts).values({
      id: crypto.randomUUID(),
      accountId: user.id,
      providerId: 'credential',
      userId: user.id,
      password: hashed,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log(`✅ Contraseña establecida: ${email}`);
  }

  console.log(`\n🎉 Listo. Contraseña para todos: ${DEFAULT_PASSWORD}`);
  await connection.end();
}

run().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});
