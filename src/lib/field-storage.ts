import type { DaySnapshot, VisitOperation, VisitResult } from './visit-types';

const DB = 'alma-field-v1';
const STORE = 'data';
const DB_VERSION = 2;
const IDENTITY = 'alma-field-user';
export const FIELD_EVENT = 'alma-field-change';

/**
 * Versión de los datos que este cliente escribe en el dispositivo. Una
 * actualización de la aplicación puede encontrarse con una jornada, un
 * borrador o una cola escritos por la versión anterior; sin un número que
 * lo declare, el único modo de saberlo sería adivinar por la forma del
 * objeto. Lo que no se sabe leer se conserva y se marca, nunca se descarta:
 * puede contener trabajo no sincronizado.
 */
export const FIELD_SCHEMA_VERSION = 2;

/** Cómo terminó el último intento de envío. Cada caso se recupera distinto. */
export type SyncOutcome =
  /** Fallo temporal (red, 429, 5xx): reintentar más tarde es correcto. */
  | 'transitorio'
  /** La sesión venció: hay que volver a iniciarla con la misma cuenta. */
  | 'sesion'
  /** El servidor rechazó la operación: requiere corregir y volver a guardar. */
  | 'rechazo'
  /** No se sabe si el servidor la aplicó: reenviar el MISMO id antes de nada. */
  | 'incierto';

export interface QueuedVisit {
  userId: string;
  operation: VisitOperation;
  createdAt: string;
  error?: string;
  blocked?: boolean;
  /** Etiqueta legible (paciente) para el centro de sincronización. */
  label?: string;
  attempts?: number;
  lastAttemptAt?: string;
  outcome?: SyncOutcome;
  version?: number;
}

interface VersionedDraft { version: number; data: unknown }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, DB_VERSION);
    request.onupgradeneeded = () => {
      // La base ya puede existir con el almacén creado por la versión 1.
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
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
  announce();
}

/**
 * Dos pestañas abiertas sobre la misma jornada son normales (una en la
 * ficha, otra en la visita). Sin aviso entre ellas, la segunda seguiría
 * mostrando una operación pendiente que la primera ya envió.
 */
let channel: BroadcastChannel | undefined;
function broadcast(): BroadcastChannel | undefined {
  if (typeof BroadcastChannel === 'undefined') return undefined;
  if (!channel) {
    channel = new BroadcastChannel('alma-field');
    channel.onmessage = () => window.dispatchEvent(new Event(FIELD_EVENT));
  }
  return channel;
}
function announce() {
  window.dispatchEvent(new Event(FIELD_EVENT));
  broadcast()?.postMessage('change');
}

export function currentFieldUser(): string | null { return localStorage.getItem(IDENTITY); }
export async function activateFieldUser(userId: string) {
  const previous = currentFieldUser();
  // Separate keys prevent another signed-in account from reading/sending these data.
  if (previous !== userId) { localStorage.setItem(IDENTITY, userId); announce(); }
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
  announce();
}

export async function saveDay(snapshot: DaySnapshot) {
  await write(`${snapshot.userId}:day`, { ...snapshot, schemaVersion: FIELD_SCHEMA_VERSION });
}
export async function getDay(userId: string) {
  const stored = await read<DaySnapshot & { schemaVersion?: number }>(`${userId}:day`);
  if (!stored) return null;
  // Una copia escrita por una versión posterior podría tener campos que
  // esta no entiende; se devuelve igual (los datos son del usuario) y la
  // interfaz avisa que conviene volver a prepararla.
  return stored;
}

export const saveFieldDraft = (userId: string, visitId: number, data: unknown) =>
  write(`${userId}:draft:${visitId}`, { version: FIELD_SCHEMA_VERSION, data } satisfies VersionedDraft);
export async function loadFieldDraft<T>(userId: string, visitId: number): Promise<T | null> {
  const stored = await read<VersionedDraft | T>(`${userId}:draft:${visitId}`);
  if (stored === null) return null;
  // Borradores de la versión anterior se guardaban sin envoltorio.
  if (typeof stored === 'object' && stored !== null && 'version' in stored && 'data' in stored) {
    return (stored as VersionedDraft).data as T;
  }
  return stored as T;
}
export const removeFieldDraft = (userId: string, visitId: number) => write(`${userId}:draft:${visitId}`, undefined);

export async function listPending(userId: string): Promise<QueuedVisit[]> {
  const db = await open();
  try { return await new Promise((resolve, reject) => {
    const values: QueuedVisit[] = []; const request = db.transaction(STORE).objectStore(STORE).openCursor();
    request.onsuccess = () => { const row = request.result; if (!row) return resolve(values.sort((a, b) => a.operation.id === b.operation.predecessorId ? -1 : b.operation.id === a.operation.predecessorId ? 1 : a.createdAt.localeCompare(b.createdAt))); if (String(row.key).startsWith(`${userId}:queue:`)) values.push(row.value); row.continue(); };
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}

export async function queueVisit(userId: string, operation: VisitOperation, label?: string) {
  if (currentFieldUser() !== userId) throw new Error('La sesión del dispositivo cambió. Vuelve a iniciar sesión.');
  // Stable operation key is written before the first network attempt.
  const existing = (await listPending(userId)).filter((q) => q.operation.visitId === operation.visitId).at(-1);
  if (existing && existing.operation.id !== operation.id && !(operation.predecessorId === existing.operation.id && ['travel', 'start'].includes(existing.operation.action))) throw new Error('Esta visita ya tiene una consulta pendiente de sincronizar.');
  await write(`${userId}:queue:${operation.id}`, {
    userId, operation, createdAt: existing?.createdAt ?? new Date().toISOString(),
    label: label ?? existing?.label, version: FIELD_SCHEMA_VERSION, attempts: 0,
  } satisfies QueuedVisit);
}
export async function removePending(userId: string, id: string) { await write(`${userId}:queue:${id}`, undefined); }

function classify(status: number): { outcome: SyncOutcome; blocked: boolean } {
  if (status === 401) return { outcome: 'sesion', blocked: true };
  if ([400, 403, 404, 409, 422].includes(status)) return { outcome: 'rechazo', blocked: true };
  return { outcome: 'transitorio', blocked: false };
}

let syncPromise: Promise<{ sent: number; error?: string }> | undefined;
export function syncPending(userId: string) {
  if (syncPromise) return syncPromise;
  syncPromise = withTabLock(userId, () => runSync(userId)).finally(() => { syncPromise = undefined; });
  return syncPromise;
}

/**
 * Evita que dos pestañas envíen la misma cola a la vez. No es un requisito
 * de corrección — el servidor deduplica por UUID — pero sí evita mensajes
 * contradictorios en pantalla mientras ambas creen estar enviando.
 */
function withTabLock<T>(userId: string, run: () => Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks?.request) return run();
  return locks.request(`alma-sync:${userId}`, run) as Promise<T>;
}

async function runSync(userId: string): Promise<{ sent: number; error?: string }> {
  let sent = 0;
  if (!navigator.onLine) return { sent, error: 'Sin conexión. Los cambios permanecen en este dispositivo.' };
  for (const item of await listPending(userId)) {
    if (currentFieldUser() !== userId) return { sent, error: 'La cuenta activa cambió. Sincronización detenida.' };
    if (item.blocked) continue;
    const attempt = { attempts: (item.attempts ?? 0) + 1, lastAttemptAt: new Date().toISOString() };
    try {
      const response = await fetch(`/api/visits/${item.operation.visitId}/sync`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Field-User': userId }, body: JSON.stringify(item.operation), signal: AbortSignal.timeout(30000),
      });
      const result = await response.json().catch(() => ({ error: 'El servidor no confirmó el guardado.' }));
      if (currentFieldUser() !== userId) return { sent, error: 'La cuenta activa cambió. Sincronización detenida.' };
      if (!response.ok) {
        const error = result.error || 'No se pudo sincronizar.';
        const { outcome, blocked } = classify(response.status);
        await write(`${userId}:queue:${item.operation.id}`, { ...item, ...attempt, error, blocked, outcome });
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
      // Sin respuesta no se puede afirmar que el servidor no la aplicó: la
      // operación conserva su UUID y se marca como resultado incierto, para
      // que el reintento sea idempotente en vez de crear un duplicado.
      const unknownResult = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'TypeError');
      const message = error instanceof Error && !unknownResult ? error.message : 'Sin respuesta del servidor. Tu guardado sigue pendiente.';
      if (currentFieldUser() === userId) {
        await write(`${userId}:queue:${item.operation.id}`, { ...item, ...attempt, error: message, outcome: unknownResult ? 'incierto' : 'transitorio' });
      }
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
  // Pedir persistencia reduce la probabilidad de que el navegador borre la
  // copia por presión de espacio. Ningún navegador la garantiza, así que la
  // interfaz no promete conservación absoluta.
  await navigator.storage?.persist?.().catch(() => false);
  const response = await fetch('/api/jornada', { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('No se pudo descargar la jornada. Revisa tu sesión y conexión.');
  const data: DaySnapshot = await response.json();
  if (data.userId !== userId || currentFieldUser() !== userId) throw new Error('La cuenta activa cambió. Recarga la página.');
  await saveDay(data); return data;
}

/**
 * Aplica una actualización del service worker solo cuando no hay nada
 * pendiente de enviar. Cambiar el shell con operaciones en cola no las
 * pierde —viven en IndexedDB— pero sí puede recargar la página a mitad de
 * un envío y dejar un resultado incierto que alguien tendrá que resolver.
 */
export async function applyPendingUpdate(userId: string): Promise<'aplicada' | 'sin-actualizacion' | 'hay-pendientes'> {
  if (!('serviceWorker' in navigator)) return 'sin-actualizacion';
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.waiting) return 'sin-actualizacion';
  if ((await listPending(userId)).length) return 'hay-pendientes';
  registration.waiting.postMessage('activar-actualizacion');
  return 'aplicada';
}

/** ¿Este dispositivo recibió permiso de almacenamiento persistente? */
export async function storageIsPersistent(): Promise<boolean> {
  try { return (await navigator.storage?.persisted?.()) ?? false; } catch { return false; }
}
