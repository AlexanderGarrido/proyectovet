import type { QueuedVisit, SyncOutcome } from '../../lib/field-storage';
import { clinicTime } from '../../lib/clinic-time';

const button = 'inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50';

const actionLabel: Record<string, string> = {
  travel: 'Salida al domicilio',
  start: 'Inicio de atención',
  save: 'Guardado de consulta',
  complete: 'Cierre de visita',
};

/**
 * Qué significa cada resultado y qué puede hacer la persona con él. La
 * distinción importa: un rechazo confirmado se corrige, un resultado
 * incierto se reenvía con el mismo identificador (nunca se recrea, o el
 * cobro y el consumo podrían quedar duplicados).
 */
const outcomeCopy: Record<SyncOutcome, { title: string; detail: string }> = {
  transitorio: { title: 'Fallo temporal', detail: 'El servidor no respondió correctamente. Reintentar es seguro.' },
  sesion: { title: 'Sesión vencida', detail: 'Vuelve a iniciar sesión con la misma cuenta y reintenta; el guardado se conserva.' },
  rechazo: { title: 'Rechazado por el servidor', detail: 'No se aplicó nada. Revisa la versión actual de la visita, corrige y guarda de nuevo.' },
  incierto: { title: 'Resultado desconocido', detail: 'No sabemos si el servidor lo aplicó. Se reenvía el mismo identificador para no duplicar; no lo descartes sin confirmar.' },
};

function ageLabel(createdAt: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(createdAt)) / 60000));
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} día(s)`;
}

/**
 * Centro de sincronización: una lista de lo que este dispositivo guardó y
 * el servidor todavía no confirmó. Antes solo existía un contador («3
 * guardados pendientes») que no decía de qué visita eran, desde cuándo
 * esperaban ni por qué no habían salido.
 */
export function SyncCenter({
  pending, busy, onSync, onOpenVisit,
}: {
  pending: QueuedVisit[];
  busy: boolean;
  onSync: () => void;
  /** Sin conexión la visita se abre dentro de la misma pantalla. */
  onOpenVisit?: (visitId: number) => void;
}) {
  if (!pending.length) return null;

  const retryable = pending.filter((item) => !item.blocked);

  return (
    <section className="rounded-xl border border-amber-300 bg-card p-4 dark:border-amber-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Pendientes de sincronizar</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {pending.length} operación(es) guardada(s) en este dispositivo. Nada se pierde al cerrar la pantalla.
          </p>
        </div>
        <button className={button} disabled={busy || !retryable.length} onClick={onSync}>
          {busy ? 'Enviando…' : 'Reintentar envío'}
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {pending.map((item) => {
          const copy = item.outcome ? outcomeCopy[item.outcome] : null;
          return (
            <li key={item.operation.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {actionLabel[item.operation.action] ?? item.operation.action}
                  {item.label ? ` · ${item.label}` : ''}
                  <span className="font-normal text-muted-foreground"> · visita #{item.operation.visitId}</span>
                </p>
                {onOpenVisit
                  ? <button className="text-sm text-primary underline-offset-2 hover:underline" onClick={() => onOpenVisit(item.operation.visitId)}>Abrir visita</button>
                  : <a className="text-sm text-primary underline-offset-2 hover:underline" href={`/citas/${item.operation.visitId}`}>Abrir visita</a>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                En cola {ageLabel(item.createdAt)}
                {item.lastAttemptAt ? ` · último intento ${clinicTime(item.lastAttemptAt)}` : ' · sin intentos aún'}
                {item.attempts ? ` · ${item.attempts} intento(s)` : ''}
              </p>
              {copy && (
                <p className="mt-2 text-xs">
                  <span className="font-medium">{copy.title}.</span> {copy.detail}
                </p>
              )}
              {item.error && <p className="mt-1 text-xs text-muted-foreground">Respuesta: {item.error}</p>}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        La aplicación sincroniza mientras está abierta. Si cierras el navegador, los envíos se retoman al volver a abrirla.
      </p>
    </section>
  );
}
