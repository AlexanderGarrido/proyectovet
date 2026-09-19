import { useCallback, useEffect, useState } from 'react';
import type { KitReport } from '../../lib/kit';
import { addClinicDays, clinicDateLabel, clinicDay } from '../../lib/clinic-time';
import { ErrorState } from '../ui/error-state';
import { features } from '../../lib/features';

const field = 'rounded-lg border bg-background px-3 py-2.5 text-base sm:text-sm';
const button = 'inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50';

const reasonLabel: Record<string, string> = {
  minimo: 'bajo el mínimo',
  plan: 'lo exige el plan del día',
  ambos: 'bajo el mínimo y lo exige el plan',
};

/**
 * Preparación del botiquín antes de salir. Separa tres cosas que no son lo
 * mismo: lo recomendado (mínimo del producto), lo disponible según el
 * servidor y lo que exige el plan del día. Y dice cuántas visitas no
 * tienen prestaciones planificadas, porque de otro modo una lista corta
 * parecería tranquilizadora cuando en realidad está incompleta.
 */
export function KitPreparation() {
  const [day, setDay] = useState(() => clinicDay());
  const [report, setReport] = useState<KitReport | null>(null);
  const [state, setState] = useState<'cargando' | 'listo' | 'error' | 'sin-conexion'>('cargando');

  const load = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) { setState('sin-conexion'); return; }
    setState('cargando');
    try {
      const response = await fetch(`/api/inventory/kit?day=${day}`);
      if (!response.ok) throw new Error('botiquín');
      setReport(await response.json());
      setState('listo');
    } catch { setState('error'); }
  }, [day]);

  useEffect(() => { load(); }, [load]);

  if (!features.botiquinPreparacion) return null;
  if (state === 'sin-conexion') {
    return (
      <section className="rounded-xl border bg-card p-4">
        <h3 className="font-semibold">Preparación del botiquín</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Los faltantes se calculan con las existencias del servidor, así que necesitan conexión. La copia del dispositivo no sirve para decidir qué cargar.
        </p>
      </section>
    );
  }
  if (state === 'error') return <ErrorState title="No se pudieron calcular los faltantes" onRetry={load} />;

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Preparación del botiquín</h3>
        <div className="flex items-center gap-2">
          <button className={button} onClick={() => setDay((d) => addClinicDays(d, -1))} aria-label="Día anterior">←</button>
          <input className={field} type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Día a preparar" />
          <button className={button} onClick={() => setDay((d) => addClinicDays(d, 1))} aria-label="Día siguiente">→</button>
        </div>
      </div>

      {state === 'cargando' || !report ? (
        <p className="mt-2 text-sm text-muted-foreground">Calculando faltantes…</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            {report.locationName ? `${report.locationName} · ` : 'Sin botiquín asignado: se usa el stock general · '}
            <span className="capitalize">{clinicDateLabel(day)}</span>
            {report.plannedVisits > 0 && ` · ${report.plannedVisits} visita(s) con plan`}
          </p>

          {report.unresolvedServices > 0 && (
            <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              {report.unresolvedServices} prestación(es) planificada(s) ya no están en el catálogo y quedaron fuera del cálculo. Revisa el plan de esas visitas.
            </p>
          )}

          {report.visitsWithoutPlan > 0 && (
            <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              {report.visitsWithoutPlan} visita(s) del día no tienen prestaciones planificadas. Esta lista cubre solo lo declarado.
            </p>
          )}

          {report.lines.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No hay faltantes según los mínimos y el plan declarado. Eso no garantiza que alcance para lo no planificado.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {report.lines.map((line) => (
                <li key={line.productId} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{line.name}</p>
                    <p className="font-semibold tabular-nums">Faltan {line.missing} {line.unit}</p>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Disponible {line.available} {line.unit} · mínimo {line.minimum}
                    {line.planned > 0 && ` · plan del día ${line.planned}`} · {reasonLabel[line.reason]}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-xs text-muted-foreground">{report.note}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Las transferencias entre botiquines se confirman en el servidor; cargar el vehículo no descuenta stock por sí solo.
          </p>
        </>
      )}
    </section>
  );
}
