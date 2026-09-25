import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ discardVisit: vi.fn(), enabled: true }));
vi.mock('../../../lib/discard-visit', () => ({ discardVisit: mocks.discardVisit }));
vi.mock('../../../lib/features', () => ({ features: { get atencionSinCita() { return mocks.enabled; } } }));
import { POST } from '../visits/[id]/discard';
import { VisitError } from '../../../lib/visit-operation';

const call = (id = '41', user: any = { id: 'vet-1', role: 'veterinario' }, fieldUser = user?.id) => POST({
  params: { id },
  locals: { user },
  request: new Request(`http://localhost/api/visits/${id}/discard`, {
    method: 'POST', headers: fieldUser ? { 'X-Field-User': fieldUser } : {},
  }),
} as any);

beforeEach(() => { vi.clearAllMocks(); mocks.enabled = true; });

describe('POST /api/visits/:id/discard', () => {
  it('descarta y confirma', async () => {
    mocks.discardVisit.mockResolvedValue({ discarded: 41 });
    const res = await call();
    expect(res.status).toBe(200);
    expect(mocks.discardVisit).toHaveBeenCalledWith(expect.objectContaining({ id: 'vet-1' }), 41);
  });
  it('con la bandera apagada responde 404', async () => {
    mocks.enabled = false;
    expect((await call()).status).toBe(404);
  });
  it('exige sesión, la misma cuenta del dispositivo y un id válido', async () => {
    expect((await call('41', null)).status).toBe(401);
    expect((await call('41', undefined, 'otra')).status).toBe(401);
    expect((await call('-3')).status).toBe(400);
    expect(mocks.discardVisit).not.toHaveBeenCalled();
  });
  it('traduce el rechazo con su motivo', async () => {
    mocks.discardVisit.mockRejectedValue(new VisitError(409, 'ya tiene nota'));
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('ya tiene nota');
  });
});
