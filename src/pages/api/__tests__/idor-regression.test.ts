/**
 * Tests de regresión para los hallazgos CRÍTICOS de la auditoría (2026-07-27):
 *
 * C1 — IDOR en /api/appointments: un tutor autenticado podía leer, modificar
 *      y cancelar las citas de CUALQUIER otro tutor (nombres, teléfonos,
 *      notas, dirección de visita), sin ningún chequeo de pertenencia.
 * C2 — /api/invoices/payment no verificaba rol: cualquier tutor autenticado
 *      podía registrar un pago falso y marcar cualquier factura como pagada.
 *
 * Estos tests deben fallar si alguien vuelve a quitar el guard de permisos
 * o el filtro de pertenencia (ownerId) de estos endpoints.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeChain(resolvedValue: any[]) {
  const chain: any = {};
  ['from', 'leftJoin', 'where', 'orderBy', 'limit', 'offset'].forEach((m) => {
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

const tutorUser = { id: 'tutor-1', role: 'tutor' };
const otroTutorOwnerId = 99;
const esteTutorOwnerId = 1;

beforeEach(() => {
  vi.mocked(db.select).mockReset();
});

describe('C1 — IDOR en /api/appointments/:id', () => {
  it('PUT → 403 para tutor (antes: cualquier tutor podía reasignar/mover cualquier cita)', async () => {
    const res = await apptPUT({
      params: { id: '1' },
      request: jsonRequest('PUT', { status: 'cancelada', veterinarianId: 'attacker-controlled' }),
      locals: { user: tutorUser, session: {} },
      url: new URL('http://localhost/api/test'),
    } as any);
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('DELETE → 403 para tutor (antes: cualquier tutor podía cancelar cualquier cita)', async () => {
    const res = await apptDELETE({
      params: { id: '1' },
      locals: { user: tutorUser, session: {} },
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

  it('GET → 404 cuando la cita pertenece a OTRO tutor (fuga de datos evitada)', async () => {
    queueSelectResults(
      [{ id: 1, ownerId: otroTutorOwnerId }], // fetch de la cita
      [{ id: esteTutorOwnerId }],             // ficha de tutor del usuario logueado
    );
    const res = await apptDetailGET({
      params: { id: '1' },
      locals: { user: tutorUser, session: {} },
      url: new URL('http://localhost/api/test'),
    } as any);
    expect(res.status).toBe(404);
  });

  it('GET → 200 cuando la cita SÍ pertenece al tutor', async () => {
    queueSelectResults(
      [{ id: 1, ownerId: esteTutorOwnerId }],
      [{ id: esteTutorOwnerId }],
    );
    const res = await apptDetailGET({
      params: { id: '1' },
      locals: { user: tutorUser, session: {} },
      url: new URL('http://localhost/api/test'),
    } as any);
    expect(res.status).toBe(200);
  });

  it('GET → 200 para staff sin restricción de pertenencia', async () => {
    queueSelectResults([{ id: 1, ownerId: otroTutorOwnerId }]);
    const res = await apptDetailGET({
      params: { id: '1' },
      locals: { user: { id: 'staff-1', role: 'veterinario' }, session: {} },
      url: new URL('http://localhost/api/test'),
    } as any);
    expect(res.status).toBe(200);
  });
});

describe('C2 — RBAC en /api/invoices/payment', () => {
  it('403 para tutor (antes: cualquier tutor podía marcar cualquier factura como pagada)', async () => {
    const res = await paymentPOST({
      request: jsonRequest('POST', { invoiceId: 1, amount: 1000, method: 'efectivo' }),
      locals: { user: tutorUser, session: {} },
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
