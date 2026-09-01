import * as crypto from 'crypto';
import { scryptAsync } from '@noble/hashes/scrypt.js';

/**
 * Hashea una contraseña con el MISMO formato que usa Better Auth para el
 * proveedor `credential` (`${saltHex}:${keyHex}`, scrypt N=16384 r=16 p=1
 * dkLen=64). Se usa tanto al crear un usuario nuevo (POST /api/users) como al
 * restablecer su contraseña desde el panel de admin (PUT /api/users/[id]).
 */
export async function hashPassword(password: string): Promise<string> {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = Buffer.from(saltBytes).toString('hex');
  const key = await scryptAsync(password.normalize('NFKC'), salt, { N: 16384, r: 16, p: 1, dkLen: 64 });
  return `${salt}:${Buffer.from(key).toString('hex')}`;
}
