/**
 * Tests de seguridad: verificar que los endpoints de staff retornan 403
 * cuando el usuario tiene un rol sin el permiso correspondiente (aquí un rol
 * no reconocido — antes se probaba con el rol 'tutor', ya retirado).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../db', () => ({ db: {} }));
vi.mock('../../../lib/auth', () => ({ auth: {} }));

import { GET as ownersGET } from '../owners/index';
import { GET as patientsGET } from '../patients/index';
import { GET as invoicesGET } from '../invoices/index';
import { GET as usersGET } from '../users/index';

const outsiderUser = {
  id: 'user-1',
  name: 'Sin Permiso',
  email: 'outsider@test.com',
  role: 'desconocido',
};

function makeContext(user: unknown = outsiderUser, searchParams = '') {
  return {
    request: new Request(`http://localhost/api/test${searchParams}`),
    locals: { user, session: {} },
    url: new URL(`http://localhost/api/test${searchParams}`),
  } as any;
}

describe('Seguridad — 403 para un rol sin permiso en endpoints de staff', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/owners → 403', async () => {
    const res = await ownersGET(makeContext());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('GET /api/patients → 403', async () => {
    const res = await patientsGET(makeContext());
    expect(res.status).toBe(403);
  });

  it('GET /api/invoices → 403', async () => {
    const res = await invoicesGET(makeContext());
    expect(res.status).toBe(403);
  });

  it('GET /api/users → 403', async () => {
    const res = await usersGET(makeContext());
    expect(res.status).toBe(403);
  });

  it('GET /api/users → 403 para veterinario (solo admin)', async () => {
    const vet = { ...outsiderUser, role: 'veterinario' };
    const res = await usersGET(makeContext(vet));
    expect(res.status).toBe(403);
  });

  it('GET /api/users → 403 para recepcionista (solo admin)', async () => {
    const recepcionista = { ...outsiderUser, role: 'recepcionista' };
    const res = await usersGET(makeContext(recepcionista));
    expect(res.status).toBe(403);
  });
});
