import type { DaySnapshot, VisitOperation, VisitResult } from './visit-types';

const DB = 'alma-field-v1';
const STORE = 'data';
const IDENTITY = 'alma-field-user';
export const FIELD_EVENT = 'alma-field-change';
export interface QueuedVisit { userId: string; operation: VisitOperation; createdAt: string; error?: string; blocked?: boolean; }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(new Error('No se pudo abrir el almacenamiento local. No cierres esta pantalla.'));
    request.onsuccess = () => resolve(request.result);
  });
}
async function read<T>(key: string): Promise<T | null> {
  if (!key.startsWith(`${currentFieldUser()}:`)) throw new Error('La cuenta activa cambió. Abre la jornada de tu sesión actual.');
  const db = await open();
  try { return await new Promise<T | null>((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result ?? null); request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
async function write(key: string, value: unknown): Promise<void> {
  if (!key.startsWith(`${currentFieldUser()}:`)) throw new Error('La cuenta activa cambió. No se guardaron datos en otra sesión.');
  const db = await open();
  try { await new Promise<void>((resolve, reject) => {
    if (!key.startsWith(`${currentFieldUser()}:`)) { reject(new Error('La cuenta activa cambió.')); return; }
    const tx = db.transaction(STORE, 'readwrite');
    if (value === undefined) tx.objectStore(STORE).delete(key); else tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(new Error('No hay espacio para guardar en este dispositivo. No cierres la consulta.')); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
  window.dispatchEvent(new Event(FIELD_EVENT));
}
export function currentFieldUser(): string | null { return localStorage.getItem(IDENTITY); }
export async function activateFieldUser(userId: string) {
  const previous = currentFieldUser();
  // Separate keys prevent another signed-in account from reading/sending these data.
  if (previous !== userId) { localStorage.setItem(IDENTITY, userId); window.dispatchEvent(new Event(FIELD_EVENT)); }
}
export async function clearFieldData(userId = currentFieldUser()) {
  if (!userId) return;
  const db = await open();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'); const cursor = tx.objectStore(STORE).openCursor();
    cursor.onsuccess = () => { const row = cursor.result; if (row) { if (String(row.key).startsWith(`${userId}:`)) row.delete(); row.continue(); } };
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  }); } finally { db.close(); }
  if (currentFieldUser() === userId) localStorage.removeItem(IDENTITY);
  window.dispatchEvent(new Event(FIELD_EVENT));
}
export async function saveDay(snapshot: DaySnapshot) { await write(`${snapshot.userId}:day`, snapshot); }
export async function getDay(userId: string) { return read<DaySnapshot>(`${userId}:day`); }
export const saveFieldDraft = (userId: string, visitId: number, data: unknown) => write(`${userId}:draft:${visitId}`, data);
export const loadFieldDraft = <T>(userId: string, visitId: number) => read<T>(`${userId}:draft:${visitId}`);
export const removeFieldDraft = (userId: string, visitId: number) => write(`${userId}:draft:${visitId}`, undefined);
export async function listPending(userId: string): Promise<QueuedVisit[]> {
  const db = await open();
  try { return await new Promise((resolve, reject) => {
    const values: QueuedVisit[] = []; const request = db.transaction(STORE).objectStore(STORE).openCursor();
    request.onsuccess = () => { const row = request.result; if (!row) return resolve(values.sort((a, b) => a.operation.id === b.operation.predecessorId ? -1 : b.operation.id === a.operation.predecessorId ? 1 : a.createdAt.localeCompare(b.createdAt))); if (String(row.key).startsWith(`${userId}:queue:`)) values.push(row.value); row.continue(); };
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
export async function queueVisit(userId: string, operation: VisitOperation) {
  if (currentFieldUser() !== userId) throw new Error('La sesión del dispositivo cambió. Vuelve a iniciar sesión.');
  // Stable operation key is written before the first network attempt.
  const existing = (await listPending(userId)).filter((q) => q.operation.visitId === operation.visitId).at(-1);
  if (existing && existing.operation.id !== operation.id && !(operation.predecessorId === existing.operation.id && ['travel', 'start'].includes(existing.operation.action))) throw new Error('Esta visita ya tiene una consulta pendiente de sincronizar.');
  await write(`${userId}:queue:${operation.id}`, { userId, operation, createdAt: existing?.createdAt ?? new Date().toISOString() } satisfies QueuedVisit);
}
export async function removePending(userId: string, id: string) { await write(`${userId}:queue:${id}`, undefined); }

let syncPromise: Promise<{ sent: number; error?: string }> | undefined;
export function syncPending(userId: string) {
  if (syncPromise) return syncPromise;
  syncPromise = runSync(userId).finally(() => { syncPromise = undefined; });
  return syncPromise;
}
async function runSync(userId: string): Promise<{ sent: number; error?: string }> {
  let sent = 0;
  if (!navigator.onLine) return { sent, error: 'Sin conexión. Los cambios permanecen en este dispositivo.' };
  for (const item of await listPending(userId)) {
    if (currentFieldUser() !== userId) return { sent, error: 'La cuenta activa cambió. Sincronización detenida.' };
    if (item.blocked) continue;
    try {
      const response = await fetch(`/api/visits/${item.operation.visitId}/sync`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Field-User': userId }, body: JSON.stringify(item.operation), signal: AbortSignal.timeout(30000),
      });
      const result = await response.json().catch(() => ({ error: 'El servidor no confirmó el guardado.' }));
      if (currentFieldUser() !== userId) return { sent, error: 'La cuenta activa cambió. Sincronización detenida.' };
      if (!response.ok) {
        const error = result.error || 'No se pudo sincronizar.';
        await write(`${userId}:queue:${item.operation.id}`, { ...item, error, blocked: [400, 403, 404, 409, 422].includes(response.status) });
        if ([401, 429].includes(response.status) || response.status >= 500) return { sent, error };
        continue;
      }
      const data = result as VisitResult;
      // Refresh cached visit before releasing the pending operation, so offline users see the confirmed result.
      const cached = await getDay(userId);
      if (cached) {
        const fresh = await fetch(`/api/visits/${data.visitId}`, { signal: AbortSignal.timeout(15000) });
        if (fresh.ok) {
          const snapshot: DaySnapshot = await fresh.json();
          if (snapshot.userId !== userId) throw new Error('La cuenta activa cambió.');
          await saveDay({ ...cached, visits: cached.visits.map((v) => v.id === data.visitId ? snapshot.visits[0] : v), products: snapshot.products, locations: snapshot.locations });
        } else throw new Error('Guardado confirmado. Falta actualizar la copia local; vuelve a sincronizar.');
      }
      if (!['travel', 'start'].includes(item.operation.action)) await removeFieldDraft(userId, data.visitId);
      await removePending(userId, item.operation.id);
      sent++;
    } catch (error) {
      const message = error instanceof Error && error.name !== 'TimeoutError' && error.name !== 'TypeError' ? error.message : 'Sin respuesta del servidor. Tu guardado sigue pendiente.';
      if (currentFieldUser() === userId) await write(`${userId}:queue:${item.operation.id}`, { ...item, error: message });
      return { sent, error: message };
    }
  }
  return { sent };
}

export async function prepareDay(userId: string): Promise<DaySnapshot> {
  if (!('serviceWorker' in navigator)) throw new Error('Este navegador no permite preparar la jornada sin conexión.');
  const registration = await navigator.serviceWorker.register('/sw.js');
  await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('No se pudo preparar la página sin conexión. Reintenta con señal.')), 30000))]);
  if (!registration.active) throw new Error('La página sin conexión todavía no está lista. Reintenta.');
  const response = await fetch('/api/jornada', { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('No se pudo descargar la jornada. Revisa tu sesión y conexión.');
  const data: DaySnapshot = await response.json();
  if (data.userId !== userId || currentFieldUser() !== userId) throw new Error('La cuenta activa cambió. Recarga la página.');
  await saveDay(data); return data;
}
