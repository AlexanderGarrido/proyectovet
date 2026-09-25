import type { DaySnapshot, OpenVisitOperation, PatientCard, QueuedOperation, VisitResult } from './visit-types';
import { localVisitId, visitFromCard } from './local-visit';

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
  operation: QueuedOperation;
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

export async function queueVisit(userId: string, operation: QueuedOperation, label?: string) {
  if (currentFieldUser() !== userId) throw new Error('La sesión del dispositivo cambió. Vuelve a iniciar sesión.');
  // Stable operation key is written before the first network attempt.
  const existing = (await listPending(userId)).filter((q) => q.operation.visitId === operation.visitId).at(-1);
  // La apertura de una atención sin cita encabeza la cadena igual que ir o
  // iniciar: la nota se guarda encadenada a ella.
  if (existing && existing.operation.id !== operation.id && !(operation.predecessorId === existing.operation.id && ['travel', 'start', 'open'].includes(existing.operation.action))) throw new Error('Esta visita ya tiene una consulta pendiente de sincronizar.');
  await write(`${userId}:queue:${operation.id}`, {
    userId, operation, createdAt: existing?.createdAt ?? new Date().toISOString(),
    label: label ?? existing?.label, version: FIELD_SCHEMA_VERSION, attempts: 0,
  } satisfies QueuedVisit);
}
export async function removePending(userId: string, id: string) { await write(`${userId}:queue:${id}`, undefined); }

const aliasKey = (userId: string, localId: number) => `${userId}:alias:${localId}`;

/**
 * Número real que el servidor asignó a una visita creada sin señal. La
 * equivalencia se conserva aunque la promoción termine: la pantalla que
 * todavía muestra el id provisorio la usa para saltar a la visita real.
 */
export async function resolveVisitAlias(userId: string, localId: number): Promise<number | null> {
  return localId < 0 ? read<number>(aliasKey(userId, localId)) : localId;
}
export const rememberVisitAlias = (userId: string, localId: number, realId: number) => write(aliasKey(userId, localId), realId);

/**
 * Reemplaza el id provisorio por el real en todo lo que el dispositivo
 * guarda: cola, borrador y copia del día. La equivalencia se escribe
 * primero, así un corte a mitad de camino se completa en el siguiente
 * envío en vez de dejar operaciones apuntando a una visita inexistente.
 */
async function promoteLocalVisit(userId: string, localId: number, realId: number) {
  // Solo un id provisorio se promueve. Un reintento de apertura que ya
  // trae el número real movería el borrador sobre sí mismo y lo borraría.
  if (localId >= 0 || localId === realId) return;
  await rememberVisitAlias(userId, localId, realId);
  for (const item of await listPending(userId)) {
    if (item.operation.visitId === localId) await write(`${userId}:queue:${item.operation.id}`, { ...item, operation: { ...item.operation, visitId: realId } });
  }
  const draft = await read<unknown>(`${userId}:draft:${localId}`);
  if (draft !== null) { await write(`${userId}:draft:${realId}`, draft); await write(`${userId}:draft:${localId}`, undefined); }
  const day = await getDay(userId);
  if (day?.visits.some((v) => v.id === localId)) await saveDay({ ...day, visits: day.visits.map((v) => v.id === localId ? { ...v, id: realId } : v) });
}

/** Termina promociones que quedaron a medias por un corte. */
async function resumePromotions(userId: string) {
  const locals = new Set((await listPending(userId)).map((q) => q.operation.visitId).filter((id) => id < 0));
  for (const localId of locals) {
    const realId = await read<number>(aliasKey(userId, localId));
    if (realId) await promoteLocalVisit(userId, localId, realId);
  }
}

/**
 * Atiende sin cita y sin señal: la visita nace en la copia local con un id
 * provisorio y su apertura queda primera en la cola.
 */
/**
 * Descarta una atención sin cita abierta por error. Si todavía no llegó al
 * servidor, basta con retirarla del dispositivo; si ya tiene número real, la
 * borra el servidor (que revalida que no tenga nota ni cobro) y recién
 * entonces se retira de aquí. Espera a cualquier envío en curso: una
 * apertura que se confirma a mitad del descarte dejaría una cita huérfana.
 */
export async function discardFieldVisit(userId: string, visitId: number): Promise<void> {
  if (syncPromise) await syncPromise.catch(() => undefined);
  await withTabLock(userId, async () => {
    const realId = visitId < 0 ? await read<number>(aliasKey(userId, visitId)) : visitId;
    if (realId) {
      const response = await fetch(`/api/visits/${realId}/discard`, {
        method: 'POST', headers: { 'X-Field-User': userId }, signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo descartar la atención. Reintenta con señal.');
      }
    }
    for (const id of new Set([visitId, realId ?? visitId])) {
      for (const item of await listPending(userId)) if (item.operation.visitId === id) await removePending(userId, item.operation.id);
      await removeFieldDraft(userId, id);
    }
    const day = await getDay(userId);
    if (day) await saveDay({ ...day, visits: day.visits.filter((v) => v.id !== visitId && v.id !== realId) });
  });
}

export async function startUnscheduledVisit(userId: string, card: PatientCard, userName: string): Promise<number> {
  const day = await getDay(userId);
  if (!day) throw new Error('Prepara la jornada sin conexión antes de atender sin señal.');
  const occurredAt = new Date().toISOString();
  const id = localVisitId();
  await saveDay({ ...day, visits: [...day.visits, visitFromCard(card, id, { id: userId, name: userName }, occurredAt)] });
  await queueVisit(userId, { id: crypto.randomUUID(), action: 'open', visitId: id, patientId: card.id, occurredAt }, card.name);
  return id;
}

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
  await resumePromotions(userId);
  // La cola se vuelve a leer en cada vuelta: confirmar una apertura cambia
  // el visitId de las operaciones que la siguen.
  const done = new Set<string>();
  for (;;) {
    const item = (await listPending(userId)).find((q) => !q.blocked && !done.has(q.operation.id));
    if (!item) break;
    done.add(item.operation.id);
    if (currentFieldUser() !== userId) return { sent, error: 'La cuenta activa cambió. Sincronización detenida.' };
    const isOpen = item.operation.action === 'open';
    if (!isOpen && item.operation.visitId < 0) {
      // Depende de una apertura que todavía no se confirmó. Si esa apertura
      // fue rechazada, esta queda bloqueada con el mismo motivo; si no, espera.
      const opener = (await listPending(userId)).find((q) => q.operation.id === item.operation.predecessorId);
      if (opener?.blocked) await write(`${userId}:queue:${item.operation.id}`, { ...item, blocked: true, outcome: 'rechazo', error: `No se pudo registrar el inicio de la atención: ${opener.error}` });
      continue;
    }
    const attempt = { attempts: (item.attempts ?? 0) + 1, lastAttemptAt: new Date().toISOString() };
    try {
      const url = isOpen ? '/api/visits/open' : `/api/visits/${item.operation.visitId}/sync`;
      const payload = isOpen
        ? { id: item.operation.id, patientId: (item.operation as OpenVisitOperation).patientId, occurredAt: (item.operation as OpenVisitOperation).occurredAt }
        : item.operation;
      const response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Field-User': userId }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30000),
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
      if (isOpen) await promoteLocalVisit(userId, item.operation.visitId, data.visitId);
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
      // Confirmar una apertura no cierra la nota: el borrador sigue en curso.
      if (!['travel', 'start', 'open'].includes(item.operation.action)) await removeFieldDraft(userId, data.visitId);
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
  const response = await fetch('/api/jornada?directorio=1', { signal: AbortSignal.timeout(30000) });
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
