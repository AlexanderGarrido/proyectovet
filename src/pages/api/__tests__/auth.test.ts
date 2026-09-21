/**
 * Tests de seguridad: verificar que todos los endpoints protegidos
 * retornan 401 cuando no hay usuario autenticado (locals.user = undefined).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock de la BD para que los tests no requieran MySQL
vi.mock('../../../db', () => ({ db: {} }));
vi.mock('../../../lib/auth', () => ({ getAuth: () => ({}) }));

import { GET as ownersGET } from '../owners/index';
import { GET as patientsGET } from '../patients/index';
import { GET as invoicesGET } from '../invoices/index';
import { GET as medicalGET } from '../medical/index';
import { GET as usersGET } from '../users/index';

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    request: new Request('http://localhost/api/test'),
    locals: { user: undefined, session: undefined },
    url: new URL('http://localhost/api/test'),
    ...overrides,
  } as any;
}

describe('Seguridad — 401 sin autenticación', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/owners → 401 sin auth', async () => {
    const res = await ownersGET(makeContext());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('GET /api/patients → 401 sin auth', async () => {
    const res = await patientsGET(makeContext());
    expect(res.status).toBe(401);
  });

  it('GET /api/invoices → 401 sin auth', async () => {
    const res = await invoicesGET(makeContext());
    expect(res.status).toBe(401);
  });

  it('GET /api/medical → 401 sin auth', async () => {
    const res = await medicalGET(makeContext());
    expect(res.status).toBe(401);
  });

  it('GET /api/users → 401 sin auth', async () => {
    const res = await usersGET(makeContext());
    expect(res.status).toBe(401);
  });
});
