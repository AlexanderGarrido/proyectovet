import { useCallback, useEffect, useState } from 'react';
import type { TimelineItem, TimelineKind, TimelinePage } from '../../lib/timeline';
import { CLINIC_TIME_ZONE } from '../../lib/clinic-time';
import { ErrorState } from '../ui/error-state';
import { Skeleton } from '../ui/skeleton';

const KIND_LABEL: Record<TimelineKind, string> = {
  consulta: 'Consultas', cita: 'Citas', vacuna: 'Vacunas', receta: 'Recetas',
  laboratorio: 'Laboratorio', documento: 'Documentos', cobro: 'Cobros', comunicacion: 'Comunicaciones',
};

const KIND_TONE: Record<TimelineKind, string> = {
  consulta: 'bg-primary/15 text-primary',
  cita: 'bg-muted text-muted-foreground',
  vacuna: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  receta: 'bg-accent text-accent-foreground',
  laboratorio: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  documento: 'bg-muted text-muted-foreground',
  cobro: 'bg-secondary text-secondary-foreground',
  comunicacion: 'bg-muted text-muted-foreground',
};

function dateLabel(at: string) {
  return new Date(at).toLocaleDateString('es-CL', { timeZone: CLINIC_TIME_ZONE, day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Cronología conjunta del paciente. Antes cada fuente tenía su pestaña, de
 * modo que reconstruir «qué pasó y en qué orden» exigía saltar entre cinco
 * vistas. Los filtros y la posición se conservan al abrir un detalle
 * porque la navegación es por enlace, no por reemplazo de la vista.
 */
export function PatientTimeline({ patientId, compact = false }: { patientId: number; compact?: boolean }) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [available, setAvailable] = useState<TimelineKind[]>([]);
  const [active, setActive] = useState<TimelineKind[]>([]);
  const [state, setState] = useState<'cargando' | 'listo' | 'error' | 'sin-conexion'>('cargando');
  const [loadingMore, setLoadingMore] = useState(false);
  // Un fallo al pedir la página siguiente no debe borrar de pantalla lo que
  // ya se había leído: se avisa junto al botón y lo cargado se conserva.
  const [moreFailed, setMoreFailed] = useState(false);

  const load = useCallback(async (nextCursor?: string, kinds: TimelineKind[] = active) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) { setState('sin-conexion'); return; }
    nextCursor ? setLoadingMore(true) : setState('cargando');
    setMoreFailed(false);
    try {
      const params = new URLSearchParams({ limit: compact ? '10' : '25' });
      if (nextCursor) params.set('cursor', nextCursor);
      if (kinds.length) params.set('kinds', kinds.join(','));
      const response = await fetch(`/api/patients/${patientId}/timeline?${params}`);
      if (!response.ok) throw new Error('cronología');
      const page: TimelinePage = await response.json();
      // Sin este filtro un elemento con la misma fecha podría entrar dos
      // veces si algo se insertó entre una página y la siguiente.
      setItems((previous) => {
        if (!nextCursor) return page.items;
        const seen = new Set(previous.map((i) => i.key));
        return [...previous, ...page.items.filter((i) => !seen.has(i.key))];
      });
      setCursor(page.nextCursor);
      if (!available.length) setAvailable(page.kinds);
      setState('listo');
    } catch {
      if (nextCursor) setMoreFailed(true);
      else setState(typeof navigator !== 'undefined' && !navigator.onLine ? 'sin-conexion' : 'error');
    } finally { setLoadingMore(false); }
  }, [patientId, compact, active, available.length]);

  useEffect(() => { load(undefined, active); }, [patientId, active.join(',')]);

  function toggle(kind: TimelineKind) {
    setActive((current) => (current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]));
  }

  if (state === 'sin-conexion') {
    return <p className="rounded-lg border bg-muted p-4 text-sm text-muted-foreground">
      La cronología completa necesita conexión. Sin señal, la visita muestra los antecedentes de la copia descargada.
    </p>;
  }
  if (state === 'error') return <ErrorState title="No se pudo cargar la cronología" onRetry={() => load()} />;

  return (
    <div className="space-y-4">
      {available.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar cronología">
          {available.map((kind) => {
            const on = active.includes(kind);
            return (
              <button
                key={kind} type="button" aria-pressed={on} onClick={() => toggle(kind)}
                className={`min-h-9 rounded-full border px-3 py-1 text-xs font-medium ${on ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {KIND_LABEL[kind]}
              </button>
            );
          })}
          {active.length > 0 && (
            <button type="button" className="min-h-9 px-3 text-xs text-primary" onClick={() => setActive([])}>Quitar filtros</button>
          )}
        </div>
      )}

      {state === 'cargando' ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !items.length ? (
        <p className="py-6 text-sm text-muted-foreground">
          {active.length ? 'No hay elementos de los tipos seleccionados.' : 'Este paciente todavía no tiene registros.'}
        </p>
      ) : (
        <ol className="space-y-2">
          {items.map((item) => (
            <li key={item.key} className="rounded-xl border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${KIND_TONE[item.kind]}`}>{KIND_LABEL[item.kind].replace(/s$/, '')}</span>
                <span className="text-xs text-muted-foreground">{dateLabel(item.at)}</span>
                {item.author && <span className="text-xs text-muted-foreground">· {item.author}</span>}
              </div>
              <p className="mt-1.5 text-sm font-medium">
                {item.href ? <a className="text-primary underline-offset-2 hover:underline" href={item.href}>{item.title}</a> : item.title}
              </p>
              {item.detail && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{item.detail}</p>}
              {item.amendsRecordId && <p className="mt-1 text-xs text-muted-foreground">Corrige un registro anterior; la nota original se conserva.</p>}
            </li>
          ))}
        </ol>
      )}

      {cursor && (
        <div className="space-y-2">
          {moreFailed && (
            <p role="alert" className="text-sm text-muted-foreground">
              No se pudo cargar el resto de la cronología. Lo ya mostrado sigue siendo válido.
            </p>
          )}
          <button type="button" disabled={loadingMore} className="min-h-11 w-full rounded-lg border text-sm font-medium disabled:opacity-50" onClick={() => load(cursor)}>
            {loadingMore ? 'Cargando…' : moreFailed ? 'Reintentar' : 'Ver más'}
          </button>
        </div>
      )}
    </div>
  );
}
