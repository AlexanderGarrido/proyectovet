/**
 * Tests de seguridad: validación en PUT endpoints.
 * Verifica que los endpoints rechazan inputs inválidos (400)
 * y requests sin autenticación (401).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../db', () => ({ db: {} }));
vi.mock('../../../lib/auth', () => ({ auth: {} }));

import { PUT as patientsPUT } from '../patients/[id]';
import { PUT as appointmentsPUT } from '../appointments/[id]';
import { PUT as ownersPUT } from '../owners/[id]';
import { PUT as invoicesPUT } from '../invoices/[id]';
import { PUT as prescriptionsPUT } from '../prescriptions/[id]';
import { PUT as labOrdersPUT } from '../lab-orders/[id]';

const DEFAULT_USER = { id: 'user-1', role: 'admin' };

function makeContext(options: {
  params?: Record<string, string>;
  body?: unknown;
  user?: unknown;
  noAuth?: boolean;
  contentType?: string;
} = {}) {
  const { params = { id: '1' }, body = {}, noAuth = false, contentType = 'application/json' } = options;
  const user = noAuth ? undefined : (options.user !== undefined ? options.user : DEFAULT_USER);
  return {
    params,
    request: new Request('http://localhost/api/test', {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: body === null ? null : JSON.stringify(body),
    }),
    locals: { user, session: noAuth ? undefined : {} },
    url: new URL('http://localhost/api/test'),
  } as any;
}

function makeInvalidJsonContext(params = { id: '1' }) {
  return {
    params,
    request: new Request('http://localhost/api/test', {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: 'this is not json',
    }),
    locals: { user: { id: 'user-1', role: 'admin' }, session: {} },
    url: new URL('http://localhost/api/test'),
  } as any;
}

describe('PUT /api/patients/:id — validación', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 sin autenticación', async () => {
    const res = await patientsPUT(makeContext({ noAuth: true }));
    expect(res.status).toBe(401);
  });

  it('400 con species inválida', async () => {
    const res = await patientsPUT(makeContext({ body: { species: 'dragon' } }));
    expect(res.status).toBe(400);
  });

  it('400 con sex inválido', async () => {
    const res = await patientsPUT(makeContext({ body: { sex: 'unknown_invalid' } }));
    expect(res.status).toBe(400);
  });

  it('400 con foto base64 mayor a 700KB', async () => {
    const bigPhoto = 'data:image/jpeg;base64,' + 'A'.repeat(700_001);
    const res = await patientsPUT(makeContext({ body: { photo: bigPhoto } }));
    expect(res.status).toBe(400);
  });

  it('400 con JSON inválido', async () => {
    const res = await patientsPUT(makeInvalidJsonContext());
    expect(res.status).toBe(400);
  });

  it('400 con nombre mayor a 100 caracteres', async () => {
    const res = await patientsPUT(makeContext({ body: { name: 'A'.repeat(101) } }));
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/appointments/:id — validación', () => {
  it('401 sin autenticación', async () => {
    const res = await appointmentsPUT(makeContext({ noAuth: true }));
    expect(res.status).toBe(401);
  });

  it('400 con status fuera del enum', async () => {
    const res = await appointmentsPUT(makeContext({ body: { status: 'hacked' } }));
    expect(res.status).toBe(400);
  });

  it('400 con type inválido', async () => {
    const res = await appointmentsPUT(makeContext({ body: { type: 'ataque' } }));
    expect(res.status).toBe(400);
  });

  it('400 con JSON inválido', async () => {
    const res = await appointmentsPUT(makeInvalidJsonContext());
    expect(res.status).toBe(400);
  });

  it('validación pasa con actualización parcial válida (solo notes)', async () => {
    // La validación pasa → llega a db.update (mockeada sin función)
    // Si llega a lanzar error de DB, la validación fue exitosa (no retornó 400)
    try {
      const res = await appointmentsPUT(makeContext({ body: { notes: 'Nota actualizada' } }));
      expect(res.status).not.toBe(400);
    } catch (err: any) {
      // Llegó a la BD — la validación fue exitosa
      expect(err.message).toMatch(/(?:update|transaction) is not a function/);
    }
  });
});

describe('PUT /api/owners/:id — validación', () => {
  it('401 sin autenticación', async () => {
    const res = await ownersPUT(makeContext({ noAuth: true }));
    expect(res.status).toBe(401);
  });

  it('400 con email inválido', async () => {
    const res = await ownersPUT(makeContext({ body: { email: 'no-es-email' } }));
    expect(res.status).toBe(400);
  });

  it('400 con JSON inválido', async () => {
    const res = await ownersPUT(makeInvalidJsonContext());
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/invoices/:id — validación', () => {
  it('401 sin autenticación', async () => {
    const res = await invoicesPUT(makeContext({ noAuth: true }));
    expect(res.status).toBe(401);
  });

  it('400 con status fuera del enum', async () => {
    const res = await invoicesPUT(makeContext({ body: { status: 'inventado' } }));
    expect(res.status).toBe(400);
  });

  it('400 con JSON inválido', async () => {
    const res = await invoicesPUT(makeInvalidJsonContext());
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/prescriptions/:id — validación', () => {
  it('401 sin autenticación', async () => {
    const res = await prescriptionsPUT(makeContext({ noAuth: true }));
    expect(res.status).toBe(401);
  });

  it('400 con status fuera del enum', async () => {
    const res = await prescriptionsPUT(makeContext({ body: { status: 'falso' } }));
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/lab-orders/:id — validación', () => {
  it('401 sin autenticación', async () => {
    const res = await labOrdersPUT(makeContext({ noAuth: true }));
    expect(res.status).toBe(401);
  });

  it('400 con status fuera del enum', async () => {
    const res = await labOrdersPUT(makeContext({ body: { status: 'fake_status' } }));
    expect(res.status).toBe(400);
  });

  it('400 con results mayor a 2000 caracteres', async () => {
    const res = await labOrdersPUT(makeContext({ body: { results: 'X'.repeat(2001) } }));
    expect(res.status).toBe(400);
  });
});
