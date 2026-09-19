import { useCallback, useEffect, useState } from 'react';
import { Check, CloudOff, Loader2, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react';
import { cn } from '../../lib/utils';
import { FIELD_EVENT, currentFieldUser, listPending, syncPending, type QueuedVisit } from '../../lib/field-storage';

/**
 * El aviso anterior decía «Sin conexión — los cambios podrían no guardarse»
 * mientras la pantalla de atención afirmaba conservar el borrador: dos
 * mensajes contradictorios sobre el mismo hecho. `navigator.onLine` describe
 * la interfaz de red, no el destino de los datos, así que aquí se separan
 * tres cosas distintas:
 *
 * - conexión: hay o no interfaz de red (aproximada, nunca una garantía);
 * - guardado local: el trabajo está escrito en este dispositivo;
 * - confirmación: el servidor aceptó la operación y la cola quedó vacía.
 */
export type SyncPhase = 'confirmado' | 'local' | 'enviando' | 'revision' | 'sin-conexion';

export interface SyncState {
  phase: SyncPhase;
  online: boolean;
  pending: QueuedVisit[];
  blocked: QueuedVisit[];
  /** Antigüedad en minutos de la operación pendiente más antigua. */
  oldestMinutes: number | null;
  syncing: boolean;
  error: string;
  refresh: () => void;
  sync: () => Promise<void>;
}

export function useSyncState(): SyncState {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState<QueuedVisit[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    const userId = currentFieldUser();
    if (!userId) { setPending([]); return; }
    listPending(userId).then(setPending).catch(() => { /* la cola se relee en el próximo evento */ });
  }, []);

  useEffect(() => {
    const network = () => setOnline(navigator.onLine);
    network();
    refresh();
    window.addEventListener('online', network);
    window.addEventListener('offline', network);
    window.addEventListener(FIELD_EVENT, refresh);
    return () => {
      window.removeEventListener('online', network);
      window.removeEventListener('offline', network);
      window.removeEventListener(FIELD_EVENT, refresh);
    };
  }, [refresh]);

  const sync = useCallback(async () => {
    const userId = currentFieldUser();
    if (!userId || syncing) return;
    setSyncing(true); setError('');
    try {
      const result = await syncPending(userId);
      if (result.error) setError(result.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo sincronizar');
    } finally {
      setSyncing(false);
      refresh();
    }
  }, [refresh, syncing]);

  const blocked = pending.filter((item) => item.blocked);
  const oldest = pending.reduce<number | null>((min, item) => {
    const minutes = Math.max(0, Math.round((Date.now() - Date.parse(item.createdAt)) / 60000));
    return min === null || minutes > min ? minutes : min;
  }, null);

  const phase: SyncPhase = syncing ? 'enviando'
    : blocked.length ? 'revision'
    : pending.length ? (online ? 'local' : 'sin-conexion')
    : online ? 'confirmado' : 'sin-conexion';

  return { phase, online, pending, blocked, oldestMinutes: oldest, syncing, error, refresh, sync };
}

const presentation: Record<SyncPhase, { label: string; short: string; icon: typeof Check; className: string }> = {
  confirmado: { label: 'Guardado confirmado', short: 'Al día', icon: Check, className: 'bg-muted text-muted-foreground' },
  local: { label: 'Guardado en este dispositivo, falta enviar', short: 'Sin enviar', icon: CloudOff, className: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' },
  enviando: { label: 'Enviando al servidor…', short: 'Enviando', icon: Loader2, className: 'bg-muted text-muted-foreground' },
  revision: { label: 'Un guardado necesita revisión', short: 'Revisar', icon: TriangleAlert, className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' },
  'sin-conexion': { label: 'Sin conexión — el trabajo queda en este dispositivo', short: 'Sin conexión', icon: WifiOff, className: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' },
};

/**
 * Indicador compacto del encabezado. Cuando todo está confirmado y hay
 * conexión no ocupa espacio: el estado neutro no necesita anunciarse.
 */
export function SyncStatus({ className }: { className?: string }) {
  const state = useSyncState();
  if (state.phase === 'confirmado' && !state.pending.length) return null;

  const { label, short, icon: Icon, className: tone } = presentation[state.phase];
  const count = state.pending.length;
  const canRetry = state.phase === 'local' && state.online;

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <span
        role="status"
        aria-live="polite"
        title={label}
        className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium', tone)}
      >
        <Icon className={cn('h-3.5 w-3.5 shrink-0', state.phase === 'enviando' && 'animate-spin')} aria-hidden />
        <span className="hidden sm:inline">{label}{count > 0 && state.phase !== 'enviando' ? ` · ${count}` : ''}</span>
        <span className="sm:hidden">{short}{count > 0 ? ` ${count}` : ''}</span>
      </span>
      {canRetry && (
        <button
          type="button"
          onClick={state.sync}
          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Enviar los guardados pendientes"
          title="Enviar los guardados pendientes"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
