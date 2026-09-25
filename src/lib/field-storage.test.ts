import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { activateFieldUser, clearFieldData, discardFieldVisit, getDay, listPending, loadFieldDraft, queueVisit, rememberVisitAlias, removePending, resolveVisitAlias, saveDay, saveFieldDraft, startUnscheduledVisit, syncPending } from './field-storage';
import type { DaySnapshot, PatientCard, VisitOperation } from './visit-types';
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

describe('Clasificación de resultados de sincronización', () => {
  it('una sesión vencida se distingue de un rechazo de datos', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Tu sesión venció' }, { status: 401 })));
    await queueVisit('vet-a', operation);
    await syncPending('vet-a');
    expect((await listPending('vet-a'))[0]).toMatchObject({ outcome: 'sesion', blocked: true, attempts: 1 });
  });

  it('un rechazo confirmado no se reintenta solo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Stock insuficiente' }, { status: 409 })));
    await queueVisit('vet-a', operation);
    await syncPending('vet-a');
    await syncPending('vet-a');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await listPending('vet-a'))[0]).toMatchObject({ outcome: 'rechazo', blocked: true });
  });

  it('un 5xx es transitorio y sigue siendo reintentable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'No disponible' }, { status: 503 })));
    await queueVisit('vet-a', operation);
    await syncPending('vet-a');
    const [pending] = await listPending('vet-a');
    expect(pending).toMatchObject({ outcome: 'transitorio', blocked: false });
    expect(pending.lastAttemptAt).toBeTruthy();
  });

  it('sin respuesta el resultado es incierto y conserva el mismo identificador', async () => {
    // El servidor pudo haberla aplicado: descartar la operación y crear
    // otra sería el camino directo a un cobro duplicado.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    await queueVisit('vet-a', operation);
    await syncPending('vet-a');
    const [pending] = await listPending('vet-a');
    expect(pending.outcome).toBe('incierto');
    // No queda bloqueada: hay que reenviarla, no corregirla.
    expect(pending.blocked).toBeFalsy();
    expect(pending.operation.id).toBe(operation.id);
  });

  it('guarda la etiqueta del paciente para el centro de sincronización', async () => {
    await queueVisit('vet-a', operation, 'Luna');
    expect((await listPending('vet-a'))[0].label).toBe('Luna');
  });

  it('lee borradores escritos por la versión anterior, sin envoltorio', async () => {
    // Un borrador viejo contiene trabajo que nadie más tiene: se migra al
    // leerlo, nunca se descarta por no reconocer su forma.
    const legacy = { reason: 'Escrito por la versión anterior' };
    const db: IDBDatabase = await new Promise((resolve) => {
      const request = indexedDB.open('alma-field-v1', 2);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('data')) request.result.createObjectStore('data'); };
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction('data', 'readwrite');
      tx.objectStore('data').put(legacy, 'vet-a:draft:42');
      tx.oncomplete = () => resolve();
    });
    db.close();
    expect(await loadFieldDraft('vet-a', 42)).toEqual(legacy);
  });
});

const card: PatientCard = {
  id: 5, name: 'Toby', species: 'perro', breed: null, weight: null, notes: null, ownerId: 9,
  owner: { firstName: 'Ana', lastName: 'Rojas', phone: null, address: null }, alerts: [], records: [], vaccines: [],
};
const fieldDay = (): DaySnapshot => ({ userId: 'vet-a', userName: 'Vet A', role: 'veterinario', day: '2026-09-24', preparedAt: '2026-09-24T08:00:00.000Z', visits: [], products: [], locations: [], directory: [card] });
const serverVisit = (id: number) => ({ ...fieldDay(), visits: [{ id, patientId: 5, status: 'en_curso', origin: 'sin_cita' }] });

/** fetch falso por ruta: apertura, sync y lectura de visita. */
function server(realId = 41, openStatus = 200) {
  return vi.fn(async (url: string, _init?: any) => {
    if (url === '/api/visits/open') return openStatus === 200
      ? Response.json({ visitId: realId, status: 'en_curso', updatedAt: '2026-09-24T15:00:00.000Z' })
      : Response.json({ error: 'El paciente está inactivo.' }, { status: openStatus });
    if (url.endsWith('/sync')) return Response.json({ visitId: realId, status: 'en_curso', updatedAt: '2026-09-24T15:01:00.000Z' });
    if (url === `/api/visits/${realId}`) return Response.json(serverVisit(realId));
    throw new Error(`ruta inesperada ${url}`);
  });
}

async function localVisitWithSave() {
  vi.stubGlobal('navigator', { onLine: false });
  await saveDay(fieldDay());
  const id = await startUnscheduledVisit('vet-a', card, 'Vet A');
  const open = (await listPending('vet-a'))[0].operation;
  await queueVisit('vet-a', { ...operation, id: crypto.randomUUID(), visitId: id, predecessorId: open.id });
  vi.stubGlobal('navigator', { onLine: true });
  return { id, open };
}

describe('Atención sin cita sin señal', () => {
  it('crea la visita local y encola la apertura', async () => {
    await saveDay(fieldDay());
    const id = await startUnscheduledVisit('vet-a', card, 'Vet A');
    expect(id).toBeLessThan(0);
    expect((await getDay('vet-a'))!.visits[0]).toMatchObject({ id, origin: 'sin_cita', status: 'en_curso' });
    expect((await listPending('vet-a'))[0].operation).toMatchObject({ action: 'open', visitId: id, patientId: 5 });
  });

  it('exige una jornada preparada', async () => {
    await expect(startUnscheduledVisit('vet-a', card, 'Vet A')).rejects.toThrow('Prepara la jornada');
  });

  it('permite encadenar el guardado a la apertura', async () => {
    await localVisitWithSave();
    expect(await listPending('vet-a')).toHaveLength(2);
  });

  it('al sincronizar: abre, reemplaza el id provisorio y envía el guardado con el real', async () => {
    const { id, open } = await localVisitWithSave();
    await saveFieldDraft('vet-a', id, { reason: 'Vómitos' });
    const fetchMock = server(41); vi.stubGlobal('fetch', fetchMock);

    expect((await syncPending('vet-a')).sent).toBe(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/visits/open');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ id: open.id, patientId: 5, occurredAt: (open as any).occurredAt });
    const syncCall = fetchMock.mock.calls.find((c: any) => String(c[0]).endsWith('/sync'))!;
    expect(syncCall[0]).toBe('/api/visits/41/sync');
    expect(JSON.parse(syncCall[1].body).visitId).toBe(41);
    expect(await resolveVisitAlias('vet-a', id)).toBe(41);
    expect((await getDay('vet-a'))!.visits.map((v) => v.id)).toEqual([41]);
    expect(await listPending('vet-a')).toEqual([]);
  });

  it('la apertura no borra el borrador: se mueve al id real', async () => {
    await saveDay(fieldDay());
    const id = await startUnscheduledVisit('vet-a', card, 'Vet A');
    await saveFieldDraft('vet-a', id, { reason: 'Vómitos' });
    vi.stubGlobal('fetch', server(41));
    await syncPending('vet-a');
    expect(await loadFieldDraft('vet-a', 41)).toEqual({ reason: 'Vómitos' });
    expect(await loadFieldDraft('vet-a', id)).toBeNull();
  });

  it('una apertura rechazada bloquea lo que depende de ella sin enviarlo', async () => {
    await localVisitWithSave();
    const fetchMock = server(41, 409); vi.stubGlobal('fetch', fetchMock);
    await syncPending('vet-a');
    const pending = await listPending('vet-a');
    expect(pending.every((p) => p.blocked)).toBe(true);
    expect(pending[1].error).toContain('inactivo');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('si falla la relectura tras abrir, el reintento conserva el borrador', async () => {
    await saveDay(fieldDay());
    const id = await startUnscheduledVisit('vet-a', card, 'Vet A');
    await saveFieldDraft('vet-a', id, { reason: 'Vómitos' });
    let reads = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, _init?: any) => {
      if (url === '/api/visits/open') return Response.json({ visitId: 41, status: 'en_curso', updatedAt: '2026-09-24T15:00:00.000Z' });
      // La primera relectura falla: la apertura ya quedó confirmada en el servidor.
      if (url === '/api/visits/41') return ++reads === 1 ? new Response('error', { status: 500 }) : Response.json(serverVisit(41));
      throw new Error(`ruta inesperada ${url}`);
    }));
    await syncPending('vet-a');
    await syncPending('vet-a');
    expect(await listPending('vet-a')).toEqual([]);
    expect(await loadFieldDraft('vet-a', 41)).toEqual({ reason: 'Vómitos' });
  });

  it('retoma un reemplazo interrumpido usando la equivalencia guardada', async () => {
    const { id, open } = await localVisitWithSave();
    // Corte después de confirmar la apertura: la equivalencia ya se escribió
    // y la apertura se retiró, pero el guardado sigue con el id provisorio.
    await rememberVisitAlias('vet-a', id, 41);
    await removePending('vet-a', open.id);
    const fetchMock = server(41); vi.stubGlobal('fetch', fetchMock);
    expect((await syncPending('vet-a')).sent).toBe(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/visits/41/sync');
  });
});

describe('Descartar una atención sin cita', () => {
  it('local sin sincronizar: se borra del dispositivo sin tocar el servidor', async () => {
    await saveDay(fieldDay());
    const id = await startUnscheduledVisit('vet-a', card, 'Vet A');
    await saveFieldDraft('vet-a', id, { reason: 'Error' });
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await discardFieldVisit('vet-a', id);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await listPending('vet-a')).toEqual([]);
    expect(await loadFieldDraft('vet-a', id)).toBeNull();
    expect((await getDay('vet-a'))!.visits).toEqual([]);
  });

  it('ya sincronizada: la descarta el servidor y se retira de la copia', async () => {
    await saveDay({ ...fieldDay(), visits: [{ id: 41 } as any] });
    const fetchMock = vi.fn(async (_url: string, _init?: any) => Response.json({ discarded: 41 })); vi.stubGlobal('fetch', fetchMock);
    await discardFieldVisit('vet-a', 41);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/visits/41/discard');
    expect(fetchMock.mock.calls[0][1].headers['X-Field-User']).toBe('vet-a');
    expect((await getDay('vet-a'))!.visits).toEqual([]);
  });

  it('si el servidor ya no la tiene (respuesta perdida en un intento anterior), se retira igual', async () => {
    await saveDay({ ...fieldDay(), visits: [{ id: 41 } as any] });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Visita no encontrada' }, { status: 404 })));
    await discardFieldVisit('vet-a', 41);
    expect((await getDay('vet-a'))!.visits).toEqual([]);
  });

  it('si el servidor la rechaza, no se borra nada del dispositivo', async () => {
    await saveDay({ ...fieldDay(), visits: [{ id: 41 } as any] });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'La atención ya tiene una nota clínica.' }, { status: 409 })));
    await expect(discardFieldVisit('vet-a', 41)).rejects.toThrow('nota clínica');
    expect((await getDay('vet-a'))!.visits).toHaveLength(1);
  });

  it('local cuya apertura ya se confirmó: descarta el número real', async () => {
    await saveDay(fieldDay());
    const id = await startUnscheduledVisit('vet-a', card, 'Vet A');
    vi.stubGlobal('fetch', server(41));
    await syncPending('vet-a');
    const fetchMock = vi.fn(async (_url: string, _init?: any) => Response.json({ discarded: 41 })); vi.stubGlobal('fetch', fetchMock);
    await discardFieldVisit('vet-a', id);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/visits/41/discard');
    expect((await getDay('vet-a'))!.visits).toEqual([]);
  });
});
