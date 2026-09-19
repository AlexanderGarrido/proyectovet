import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { TaskRow } from '../../lib/followups';
import { clinicHhmm } from '../../lib/clinic-time';
import { ErrorState } from '../ui/error-state';

const button = 'inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50';

interface UnclosedVisit { id: number; patientName: string; status: string; scheduledAt: string }

const kindLabel: Record<string, string> = {
  consulta_por_cerrar: 'Consulta por cerrar',
  resultado_por_revisar: 'Resultado por revisar',
  seguimiento: 'Seguimiento',
  cobro_pendiente: 'Cobro pendiente',
  contacto: 'Contacto',
  otra: 'Pendiente',
};

/**
 * Pendientes del día. Separa dos cosas que antes se confundían: una
 * consulta iniciada sin cerrar (estado de la agenda) y una tarea
 * administrativa como un cobro por confirmar. Cerrar la atención con
 * saldo no la deja incompleta; deja un pendiente distinto.
 */
export function DayTasks({ offline = false }: { day?: string; offline?: boolean }) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [unclosed, setUnclosed] = useState<UnclosedVisit[]>([]);
  const [state, setState] = useState<'cargando' | 'listo' | 'error' | 'sin-conexion'>('cargando');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (offline || (typeof navigator !== 'undefined' && !navigator.onLine)) { setState('sin-conexion'); return; }
    setState('cargando');
    try {
      const response = await fetch('/api/tasks');
      if (!response.ok) throw new Error('pendientes');
      const data: { tasks: TaskRow[]; unclosed: UnclosedVisit[] } = await response.json();
      setTasks(data.tasks); setUnclosed(data.unclosed); setState('listo');
    } catch { setState('error'); }
  }, [offline]);

  useEffect(() => { load(); }, [load]);

  async function complete(id: number) {
    setBusy(true);
    try {
      const response = await fetch('/api/tasks', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'completada' }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'No se pudo cerrar el pendiente');
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo cerrar el pendiente'); }
    finally { setBusy(false); }
  }

  if (state === 'sin-conexion') {
    return (
      <section className="rounded-xl border bg-card p-4">
        <h3 className="font-semibold">Pendientes</h3>
        <p className="mt-1 text-sm text-muted-foreground">La bandeja de pendientes necesita conexión; no viaja en la copia descargada.</p>
      </section>
    );
  }
  if (state === 'error') return <ErrorState className="rounded-xl border bg-card" title="No se pudieron cargar los pendientes" onRetry={load} />;
  if (state === 'listo' && !tasks.length && !unclosed.length) return null;

  const overdue = tasks.filter((t) => t.overdue);

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">
          Pendientes{tasks.length ? ` (${tasks.length})` : ''}
          {overdue.length > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">{overdue.length} vencido(s)</span>}
        </h3>
        <button type="button" className="min-h-11 text-sm text-primary" onClick={load}>Actualizar</button>
      </div>

      {state === 'cargando' && <p className="mt-2 text-sm text-muted-foreground">Cargando pendientes…</p>}

      {unclosed.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-medium">Atenciones iniciadas sin cerrar</p>
          <ul className="mt-1.5 space-y-1.5">
            {unclosed.map((visit) => (
              <li key={visit.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                <span>{clinicHhmm(visit.scheduledAt)} · {visit.patientName}</span>
                <a className="text-sm text-primary underline-offset-2 hover:underline" href={`/citas/${visit.id}`}>Retomar</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tasks.length > 0 && (
        <ul className="mt-3 space-y-2">
          {tasks.map((task) => (
            <li key={task.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {task.title}
                    {task.patientName && <span className="font-normal text-muted-foreground"> · {task.patientName}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {kindLabel[task.kind] ?? task.kind}
                    {task.dueDate && ` · vence ${task.dueDate}`}
                    {task.overdue && ' · vencido'}
                    {task.assignedName ? ` · ${task.assignedName}` : ' · sin asignar'}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {task.appointmentId && <a className={button} href={`/citas/${task.appointmentId}`}>Ver visita</a>}
                  <button type="button" className={button} disabled={busy} onClick={() => complete(task.id)}>Marcar hecho</button>
                </div>
              </div>
              {task.detail && <p className="mt-1.5 whitespace-pre-wrap text-xs text-muted-foreground">{task.detail}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
