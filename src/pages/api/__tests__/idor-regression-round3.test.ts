/**
 * Tests de regresión — escaneo de seguridad ronda 3 (2026-07-28).
 *
 * Se encontraron ~13 endpoints de DETALLE ([id].ts) que solo exigían sesión
 * (sin chequeo de rol ni pertenencia), pese a que las rondas anteriores ya
 * habían corregido los listados equivalentes. Un tutor autenticado podía:
 *  - Leer/modificar la ficha de cualquier paciente o tutor ajeno.
 *  - Marcar cualquier factura como pagada/anulada (fraude financiero).
 *  - Alterar los RESULTADOS de cualquier orden de laboratorio ajena.
 *  - Modificar cualquier receta ajena.
 *  - Leer el historial clínico completo de cualquier paciente.
 *  - Listar todas las próximas dosis de vacunas de la clínica (PII masiva).
 *  - Ver los horarios internos de todos los veterinarios.
 *  - Descargar el PDF de cualquier factura/receta/orden ajena.
 *
 * Ninguno de estos endpoints tiene un caller de UI para tutores (usan sus
 * propios /api/client/*), así que la corrección es bloquearlos por
 * completo para ese rol, no construir un chequeo de pertenencia nuevo.
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
import { GET as patientDetailGET, PUT as patientDetailPUT } from '../patients/[id]';
import { GET as ownerDetailGET, PUT as ownerDetailPUT } from '../owners/[id]';
import { GET as invoiceDetailGET, PUT as invoiceDetailPUT } from '../invoices/[id]';
import { PUT as labOrderDetailPUT } from '../lab-orders/[id]';
import { GET as prescriptionDetailGET, PUT as prescriptionDetailPUT } from '../prescriptions/[id]';
import { GET as medicalDetailGET } from '../medical/[id]';
import { GET as vaccinesUpcomingGET } from '../vaccines/upcoming';
import { GET as schedulesGET } from '../schedules/index';
import { GET as invoicePdfGET } from '../invoices/[id]/pdf';
import { GET as labOrderPdfGET } from '../lab-orders/[id]/pdf';
import { GET as prescriptionPdfGET } from '../prescriptions/[id]/pdf';

function ctx(user: unknown, params: Record<string, string> = { id: '1' }, body?: unknown) {
  return {
    params,
    request: body
      ? new Request('http://localhost/api/test', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : new Request('http://localhost/api/test'),
    locals: { user, session: user ? {} : undefined },
    url: new URL('http://localhost/api/test'),
  } as any;
}

const outsiderUser = { id: 'outsider-1', role: 'desconocido' };
const vetUser = { id: 'vet-1', role: 'veterinario' };
const recepUser = { id: 'recep-1', role: 'recepcionista' };

beforeEach(() => {
  vi.mocked(db.select).mockReset();
});

describe('IDOR ronda 3 — endpoints de detalle bloqueados para un rol sin permiso', () => {
  it('GET /api/patients/:id → 403 para un rol sin permiso', async () => {
    const res = await patientDetailGET(ctx(outsiderUser));
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('PUT /api/patients/:id → 403 para un rol sin permiso', async () => {
    const res = await patientDetailPUT(ctx(outsiderUser, { id: '1' }, { name: 'hackeado' }));
    expect(res.status).toBe(403);
  });

  it('GET /api/owners/:id → 403 para un rol sin permiso', async () => {
    const res = await ownerDetailGET(ctx(outsiderUser));
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('PUT /api/owners/:id → 403 para un rol sin permiso', async () => {
    const res = await ownerDetailPUT(ctx(outsiderUser, { id: '1' }, { firstName: 'hackeado' }));
    expect(res.status).toBe(403);
  });

  it('GET /api/invoices/:id → 403 para un rol sin permiso (antes: podía leer cualquier factura ajena)', async () => {
    const res = await invoiceDetailGET(ctx(outsiderUser));
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('PUT /api/invoices/:id → 403 para un rol sin permiso (antes: podía marcar cualquier factura como pagada/anulada)', async () => {
    const res = await invoiceDetailPUT(ctx(outsiderUser, { id: '1' }, { status: 'pagada' }));
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('PUT /api/lab-orders/:id → 403 para un rol sin permiso (antes: podía alterar resultados de laboratorio ajenos)', async () => {
    const res = await labOrderDetailPUT(ctx(outsiderUser, { id: '1' }, { status: 'completado', results: 'alterado' }));
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('GET /api/prescriptions/:id → 403 para un rol sin permiso', async () => {
    const res = await prescriptionDetailGET(ctx(outsiderUser));
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('PUT /api/prescriptions/:id → 403 para un rol sin permiso', async () => {
    const res = await prescriptionDetailPUT(ctx(outsiderUser, { id: '1' }, { status: 'cancelada' }));
    expect(res.status).toBe(403);
  });

  it('GET /api/medical/:id → 403 para un rol sin permiso (antes: historial clínico completo de cualquier paciente)', async () => {
    const res = await medicalDetailGET(ctx(outsiderUser));
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('GET /api/vaccines/upcoming → 403 para un rol sin permiso (antes: listado masivo de PII de todos los tutores)', async () => {
    const res = await vaccinesUpcomingGET(ctx(outsiderUser));
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('GET /api/vaccines/upcoming → permitido (no 403) para recepcionista', async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([]) as any);
    const res = await vaccinesUpcomingGET(ctx(recepUser));
    expect(res.status).not.toBe(403);
  });

  it('GET /api/schedules → 403 para un rol sin permiso', async () => {
    const res = await schedulesGET(ctx(outsiderUser));
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('GET /api/invoices/:id/pdf → 403 para un rol sin permiso (antes: podía descargar el PDF de cualquier factura ajena)', async () => {
    const res = await invoicePdfGET(ctx(outsiderUser));
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('GET /api/lab-orders/:id/pdf → 403 para un rol sin permiso', async () => {
    const res = await labOrderPdfGET(ctx(outsiderUser));
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('GET /api/prescriptions/:id/pdf → 403 para un rol sin permiso', async () => {
    const res = await prescriptionPdfGET(ctx(outsiderUser));
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe('IDOR ronda 3 — el staff correspondiente sigue teniendo acceso', () => {
  it('GET /api/patients/:id → permitido (no 403) para veterinario', async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([]) as any);
    const res = await patientDetailGET(ctx(vetUser));
    expect(res.status).not.toBe(403);
  });

  it('GET /api/owners/:id → permitido (no 403) para recepcionista', async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([]) as any);
    const res = await ownerDetailGET(ctx(recepUser));
    expect(res.status).not.toBe(403);
  });

  it('GET /api/invoices/:id → permitido (no 403) para recepcionista', async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([]) as any);
    const res = await invoiceDetailGET(ctx(recepUser));
    expect(res.status).not.toBe(403);
  });

  it('PUT /api/lab-orders/:id → permitido (no 403) para veterinario', async () => {
    try {
      const res = await labOrderDetailPUT(ctx(vetUser, { id: '1' }, { status: 'completado' }));
      expect(res.status).not.toBe(403);
    } catch (err: any) {
      expect(err.message).toMatch(/update is not a function/);
    }
  });

  it('GET /api/medical/:id → permitido (no 403) para recepcionista', async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeChain([]) as any);
    const res = await medicalDetailGET(ctx(recepUser));
    expect(res.status).not.toBe(403);
  });
});
