/**
 * Tests de regresión para hallazgos CRÍTICOS de la auditoría (2026-07-27) y
 * los IDOR encontrados después, al migrar endpoints a guard.ts.
 *
 * Contexto histórico: varios de estos IDOR los explotaba el rol 'tutor'
 * (portal self-service). Ese portal y ese rol fueron retirados — ahora toda
 * cuenta autenticada es staff. Los tests se conservan porque el invariante
 * sigue vigente: un rol SIN el permiso correspondiente (aquí uno no
 * reconocido) debe recibir 403 antes de tocar la base de datos.
 *
 * C1 — /api/appointments/:id: PUT/DELETE exigen 'appointments:write'.
 * C2 — /api/invoices/payment: POST exige rol con permiso de pagos.
 * Regresión guard.ts: GET /api/patients y GET /api/invoices no filtran por
 *      pertenencia — deben rechazar por completo a un rol sin el permiso
 *      directo, no solo a roles sin ningún permiso.
 * POST /api/owners: exige 'owners:write'.
 *
 * Estos tests deben fallar si alguien quita el guard de permisos de estos
 * endpoints.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeChain(resolvedValue: any[]) {
  const chain: any = {};
  ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'limit', 'offset'].forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  chain.then = (resolve: any, reject: any) => Promise.resolve(resolvedValue).then(resolve, reject);
  return chain;
}

vi.mock('../../../db', () => ({ db: { select: vi.fn() } }));
vi.mock('../../../lib/auth', () => ({ auth: {} }));

import { db } from '../../../db';
import { PUT as apptPUT, DELETE as apptDELETE, GET as apptDetailGET } from '../appointments/[id]';
import { POST as paymentPOST } from '../invoices/payment';
import { GET as patientsGET } from '../patients/index';
import { GET as invoicesGET } from '../invoices/index';
import { POST as ownersPOST } from '../owners/index';

function queueSelectResults(...values: any[][]) {
  const select = vi.mocked(db.select);
  select.mockReset();
  values.forEach((v) => select.mockReturnValueOnce(makeChain(v) as any));
}

function jsonRequest(method: string, body: unknown) {
  return new Request('http://localhost/api/test', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Rol no reconocido: no aparece en la tabla de permisos → hasPermission = false.
const outsiderUser = { id: 'outsider-1', role: 'desconocido' };

beforeEach(() => {
  vi.mocked(db.select).mockReset();
});

describe('C1 — RBAC en /api/appointments/:id', () => {
  it('PUT → 403 para un rol sin permiso (antes: cualquier tutor podía reasignar/mover cualquier cita)', async () => {
    const res = await apptPUT({
      params: { id: '1' },
      request: jsonRequest('PUT', { status: 'cancelada', veterinarianId: 'attacker-controlled' }),
      locals: { user: outsiderUser, session: {} },
      url: new URL('http://localhost/api/test'),
    } as any);
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('DELETE → 403 para un rol sin permiso (antes: cualquier tutor podía cancelar cualquier cita)', async () => {
    const res = await apptDELETE({
      params: { id: '1' },
      locals: { user: outsiderUser, session: {} },
      url: new URL('http://localhost/api/test'),
    } as any);
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('PUT → permitido (no 403) para recepcionista', async () => {
    // El guard de permisos deja pasar a recepcionista; llega hasta db.update
    // (no mockeado aquí) — eso en sí prueba que no fue bloqueada por rol.
    try {
      const res = await apptPUT({
        params: { id: '1' },
        request: jsonRequest('PUT', { notes: 'ok' }),
        locals: { user: { id: 'staff-1', role: 'recepcionista' }, session: {} },
        url: new URL('http://localhost/api/test'),
      } as any);
      expect(res.status).not.toBe(403);
    } catch (err: any) {
      expect(err.message).toMatch(/update is not a function/);
    }
  });

  it('GET → 200 para staff', async () => {
    queueSelectResults([{ id: 1, ownerId: 99 }]);
    const res = await apptDetailGET({
      params: { id: '1' },
      locals: { user: { id: 'staff-1', role: 'veterinario' }, session: {} },
      url: new URL('http://localhost/api/test'),
    } as any);
    expect(res.status).toBe(200);
  });
});

describe('C2 — RBAC en /api/invoices/payment', () => {
  it('403 para un rol sin permiso (antes: cualquier tutor podía marcar cualquier factura como pagada)', async () => {
    const res = await paymentPOST({
      request: jsonRequest('POST', { invoiceId: 1, amount: 1000, method: 'efectivo' }),
      locals: { user: outsiderUser, session: {} },
      url: new URL('http://localhost/api/test'),
    } as any);
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('no bloquea por rol a recepcionista (pasa el guard, falla más adelante por falta de mock de BD)', async () => {
    queueSelectResults([]); // factura no encontrada tras pasar el guard
    const res = await paymentPOST({
      request: jsonRequest('POST', { invoiceId: 1, amount: 1000, method: 'efectivo' }),
      locals: { user: { id: 'staff-1', role: 'recepcionista' }, session: {} },
      url: new URL('http://localhost/api/test'),
    } as any);
    expect(res.status).not.toBe(403);
  });

  it('no bloquea por rol a veterinario (puede cobrar en el domicilio)', async () => {
    queueSelectResults([]);
    const res = await paymentPOST({
      request: jsonRequest('POST', { invoiceId: 1, amount: 1000, method: 'efectivo' }),
      locals: { user: { id: 'vet-1', role: 'veterinario' }, session: {} },
      url: new URL('http://localhost/api/test'),
    } as any);
    expect(res.status).not.toBe(403);
  });
});

describe('Regresión — listados sin filtro de pertenencia no aceptan un rol sin permiso directo', () => {
  it('GET /api/patients → 403 para un rol sin permiso', async () => {
    const res = await patientsGET({
      request: new Request('http://localhost/api/test'),
      locals: { user: outsiderUser, session: {} },
      url: new URL('http://localhost/api/test'),
    } as any);
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('GET /api/invoices → 403 para un rol sin permiso', async () => {
    const res = await invoicesGET({
      request: new Request('http://localhost/api/test'),
      locals: { user: outsiderUser, session: {} },
      url: new URL('http://localhost/api/test'),
    } as any);
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe('POST /api/owners — exige owners:write', () => {
  it('403 para un rol sin permiso (antes: cualquier usuario autenticado podía crear fichas)', async () => {
    const res = await ownersPOST({
      request: jsonRequest('POST', { firstName: 'X', lastName: 'Y', email: 'x@y.com' }),
      locals: { user: outsiderUser, session: {} },
      url: new URL('http://localhost/api/test'),
    } as any);
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });
});
