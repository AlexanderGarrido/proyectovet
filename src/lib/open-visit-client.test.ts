import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpener } from './open-visit-client';

afterEach(() => vi.unstubAllGlobals());

describe('apertura con señal', () => {
  it('reintenta con el mismo UUID y la misma hora si no hubo respuesta', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('sin red'))
      .mockResolvedValueOnce(Response.json({ visitId: 41 }));
    vi.stubGlobal('fetch', fetchMock);
    const open = createOpener('vet-1');
    await expect(open(5)).rejects.toThrow();
    await expect(open(5)).resolves.toBe(41);
    const [first, second] = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    // Mismo id Y misma hora: el servidor compara el hash del payload, y una
    // hora distinta haría que un reintento legítimo se rechazara con 409.
    expect(second).toEqual(first);
    expect(fetchMock.mock.calls[0][1].headers['X-Field-User']).toBe('vet-1');
  });
  it('otro paciente usa otro UUID', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: any) => Response.json({ visitId: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const open = createOpener('vet-1');
    await open(5); await open(6);
    const [a, b] = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).id);
    expect(a).not.toBe(b);
  });
  it('muestra el motivo del rechazo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'El paciente está inactivo.' }, { status: 409 })));
    await expect(createOpener('vet-1')(5)).rejects.toThrow('inactivo');
  });
});
