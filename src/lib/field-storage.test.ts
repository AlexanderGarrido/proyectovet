import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { activateFieldUser, clearFieldData, getDay, listPending, loadFieldDraft, queueVisit, saveDay, saveFieldDraft, syncPending } from './field-storage';
import type { DaySnapshot, VisitOperation } from './visit-types';
const operation: VisitOperation = { id: '7f3f63d0-5c8d-4cb9-9bf2-9fbc65d65031', visitId: 1, expectedUpdatedAt: '2026-09-16T10:00:00.000Z', action: 'complete', record: { reason: 'Consulta' }, noCharge: true };
beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { onLine: true });
  const values = new Map();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  await activateFieldUser('vet-a');
});
afterEach(() => vi.unstubAllGlobals());
describe('Cola de visitas', () => {
  it('conserva operación y mismo ID tras respuesta perdida', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(Response.json({ visitId: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    await queueVisit('vet-a', operation);
    expect((await syncPending('vet-a')).sent).toBe(0);
    expect((await listPending('vet-a'))[0].operation.id).toBe(operation.id);
    expect((await syncPending('vet-a')).sent).toBe(1);
    expect(await listPending('vet-a')).toEqual([]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).id).toBe(JSON.parse(fetchMock.mock.calls[1][1].body).id);
  });
  it('guarda offline sin intentar red y no duplica consulta pendiente', async () => {
    vi.stubGlobal('navigator', { onLine: false }); const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await queueVisit('vet-a', operation); await syncPending('vet-a');
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(queueVisit('vet-a', { ...operation, id: crypto.randomUUID() })).rejects.toThrow('pendiente');
    expect(await listPending('vet-a')).toHaveLength(1);
  });
  it('puede iniciar y cerrar offline: ordena la consulta tras su inicio', async () => {
    const start = { ...operation, id: crypto.randomUUID(), action: 'start' as const, record: undefined, noCharge: undefined };
    await queueVisit('vet-a', start);
    await queueVisit('vet-a', { ...operation, predecessorId: start.id });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ visitId: 1 }));
    fetchMock.mockImplementation(async () => Response.json({ visitId: 1 })); vi.stubGlobal('fetch', fetchMock);
    expect((await syncPending('vet-a')).sent).toBe(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).action).toBe('start');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).predecessorId).toBe(start.id);
  });
  it('conserva el borrador que se escribe mientras inicio espera conexión', async () => {
    await saveFieldDraft('vet-a', 1, { treatment: 'Indicaciones nuevas' });
    await queueVisit('vet-a', { ...operation, action: 'start', record: undefined });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ visitId: 1 })));
    await syncPending('vet-a');
    expect(await loadFieldDraft('vet-a', 1)).toEqual({ treatment: 'Indicaciones nuevas' });
  });
  it('un conflicto conserva payload y detiene reintentos automáticos', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Stock insuficiente' }, { status: 409 })));
    await queueVisit('vet-a', operation); await syncPending('vet-a'); await syncPending('vet-a');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await listPending('vet-a'))[0]).toMatchObject({ blocked: true, error: 'Stock insuficiente', operation });
  });
  it('separa usuarios y borra borradores y jornada al salir', async () => {
    await saveFieldDraft('vet-a', 1, { reason: 'Privado' }); await queueVisit('vet-a', operation);
    await saveDay({ userId: 'vet-a', visits: [] } as unknown as DaySnapshot);
    await activateFieldUser('vet-b');
    await expect(getDay('vet-a')).rejects.toThrow('cuenta');
    expect(await listPending('vet-b')).toEqual([]);
    await expect(queueVisit('vet-a', operation)).rejects.toThrow('sesión');
    await activateFieldUser('vet-a'); await clearFieldData('vet-a'); await activateFieldUser('vet-a');
    expect(await listPending('vet-a')).toEqual([]); expect(await getDay('vet-a')).toBeNull(); expect(await loadFieldDraft('vet-a', 1)).toBeNull();
  });
  it('no resucita datos cuando la sesión cambia durante el envío', async () => {
    await queueVisit('vet-a', operation);
    vi.stubGlobal('fetch', vi.fn(async () => { await clearFieldData('vet-a'); await activateFieldUser('vet-b'); return Response.json({ visitId: 1 }); }));
    expect((await syncPending('vet-a')).sent).toBe(0);
    await activateFieldUser('vet-a'); expect(await listPending('vet-a')).toEqual([]); expect(await getDay('vet-a')).toBeNull();
  });
});
