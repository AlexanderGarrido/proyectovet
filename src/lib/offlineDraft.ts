/**
 * Borradores locales en IndexedDB: si se corta la conexión (o se cierra la
 * pestaña sin querer) a mitad de escribir una nota clínica en el domicilio,
 * el veterinario no pierde lo ya escrito — al volver a abrir el formulario
 * se le ofrece recuperarlo. No es sincronización offline completa (eso
 * requiere una cola de reintento contra el servidor); es la protección
 * mínima y de mayor impacto: no perder el trabajo ya hecho.
 *
 * Solo corre en el navegador (usa `indexedDB`); no importar desde código
 * de servidor.
 */
const DB_NAME = 'alma-vet-drafts';
const STORE = 'drafts';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDraft<T>(key: string, data: T): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ data, savedAt: Date.now() }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Best-effort: si el navegador no soporta IndexedDB o falla, no bloquea el formulario.
  }
}

export async function loadDraft<T>(key: string): Promise<{ data: T; savedAt: number } | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function deleteDraft(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // best-effort
  }
}
