import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ openVisit: vi.fn(), enabled: true }));
vi.mock('../../../lib/open-visit', () => ({ openVisit: mocks.openVisit }));
vi.mock('../../../lib/features', () => ({ features: { get atencionSinCita() { return mocks.enabled; } } }));
import { POST } from '../visits/open';
import { VisitError } from '../../../lib/visit-operation';

const body = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', patientId: 5, occurredAt: new Date().toISOString() };
const call = (user: any = { id: 'vet-1', role: 'veterinario' }, payload: unknown = body, fieldUser = user?.id) => POST({
  locals: { user },
  request: new Request('http://localhost/api/visits/open', {
    method: 'POST', body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json', ...(fieldUser ? { 'X-Field-User': fieldUser } : {}) },
  }),
} as any);

beforeEach(() => { vi.clearAllMocks(); mocks.enabled = true; });

describe('POST /api/visits/open', () => {
  it('abre y devuelve el comprobante', async () => {
    mocks.openVisit.mockResolvedValue({ visitId: 41, status: 'en_curso' });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ visitId: 41 });
    expect(mocks.openVisit).toHaveBeenCalledWith(expect.objectContaining({ id: 'vet-1' }), body);
  });
  it('con la bandera apagada responde 404', async () => {
    mocks.enabled = false;
    expect((await call()).status).toBe(404);
    expect(mocks.openVisit).not.toHaveBeenCalled();
  });
  it('exige sesión y la misma cuenta del dispositivo', async () => {
    expect((await call(null)).status).toBe(401);
    expect((await call(undefined, body, 'otra-cuenta')).status).toBe(401);
  });
  it('rechaza campos de más', async () => {
    expect((await call(undefined, { ...body, record: { reason: 'x' } })).status).toBe(400);
  });
  it('traduce VisitError a su código', async () => {
    mocks.openVisit.mockRejectedValue(new VisitError(409, 'inactivo'));
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('inactivo');
  });
  it('un error inesperado es 503: el teléfono conserva la operación', async () => {
    mocks.openVisit.mockRejectedValue(new Error('db caída'));
    expect((await call()).status).toBe(503);
  });
});
