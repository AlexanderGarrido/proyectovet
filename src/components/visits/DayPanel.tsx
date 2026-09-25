import { useEffect, useState } from 'react';
import type { DaySnapshot, VisitSnapshot } from '../../lib/visit-types';
import { clinicDay, clinicDateLabel, clinicHhmm, clinicTime } from '../../lib/clinic-time';
import { FIELD_EVENT, applyPendingUpdate, getDay, prepareDay, resolveVisitAlias, startUnscheduledVisit, type QueuedVisit } from '../../lib/field-storage';
import { createOpener } from '../../lib/open-visit-client';
import { PatientPicker, type PickedPatient } from './PatientPicker';
import { useSyncState } from '../common/SyncStatus';
import { useFieldIdentity } from './useFieldIdentity';
import { VisitWorkspace } from './VisitWorkspace';
import { VisitStatusBadge } from './VisitStatusBadge';
import { CoverageNotice } from './CoverageNotice';
import { SyncCenter } from './SyncCenter';
import { DayTasks } from './DayTasks';
import { googleMapsUrl } from '../../lib/maps';
import { features } from '../../lib/features';

const button = 'inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50';

export function dayMetrics(visits: VisitSnapshot[]) {
  const active = visits.filter((v) => !['cancelada', 'no_asistio', 'completada'].includes(v.status));
  const completed = visits.filter((v) => v.status === 'completada');
  const due = visits.flatMap((v) => v.invoices).filter((i) => i.status !== 'anulada').reduce((sum, i) => sum + Math.max(0, Number(i.total) - i.paid), 0);
  const durations = completed.filter((v) => v.startedAt && v.completedAt).map((v) => Math.max(0, (Date.parse(v.completedAt!) - Date.parse(v.startedAt!)) / 60000));
  return { active: active.length, completed: completed.length, due, averageMinutes: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null };
}

/**
 * Acción principal según el momento de la visita. Antes todas las tarjetas
 * decían «Abrir visita», así que la pantalla no ayudaba a decidir el
 * siguiente paso: hay que leer el estado y traducirlo mentalmente.
 */
export function nextActionLabel(visit: VisitSnapshot, hasRecord: boolean): string {
  if (['completada', 'cancelada', 'no_asistio'].includes(visit.status)) return 'Ver visita';
  if (visit.status === 'en_curso') return hasRecord ? 'Revisar cierre' : 'Continuar atención';
  if (visit.status === 'en_camino') return 'Iniciar atención';
  return 'Salir hacia el domicilio';
}

export function DayPanel({ initial, offline = false, initialVisitId }: { initial: DaySnapshot; offline?: boolean; initialVisitId?: number }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [selected, setSelected] = useState(initialVisitId);
  const [busy, setBusy] = useState(false);
  // Se separan a propósito: un éxito momentáneo puede desaparecer, un
  // problema pendiente no. Antes compartían la misma variable y un aviso
  // de error se perdía cuando terminaba la siguiente acción.
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [updateReady, setUpdateReady] = useState(false);
  const identityValid = useFieldIdentity(initial.userId);
  const sync = useSyncState();
  const metrics = dayMetrics(snapshot.visits);
  const current = snapshot.visits.find((v) => v.status === 'en_curso') || snapshot.visits.find((v) => !['completada', 'cancelada', 'no_asistio'].includes(v.status));

  // Estado pendiente por visita: se mantiene aunque el usuario navegue,
  // porque se lee de la cola local y no del estado de esta pantalla.
  const pendingByVisit = new Map<number, QueuedVisit>();
  for (const item of sync.pending) pendingByVisit.set(item.operation.visitId, item);

  useEffect(() => {
    if (!offline) return;
    const update = () => { getDay(initial.userId).then((cached) => { if (cached) setSnapshot(cached); }).catch((e) => setProblem(e.message)); };
    update();
    window.addEventListener(FIELD_EVENT, update);
    return () => window.removeEventListener(FIELD_EVENT, update);
  }, [initial.userId, offline]);

  // Una versión nueva espera a que la cola esté vacía antes de reemplazar
  // la que controla esta pestaña: recargar a mitad de un envío dejaría un
  // resultado incierto que después hay que resolver a mano.
  useEffect(() => {
    let active = true;
    const check = () => applyPendingUpdate(initial.userId)
      .then((result) => { if (active) setUpdateReady(result === 'hay-pendientes'); })
      .catch(() => { /* sin service worker o sin permiso: no hay nada que ofrecer */ });
    check();
    window.addEventListener(FIELD_EVENT, check);
    return () => { active = false; window.removeEventListener(FIELD_EVENT, check); };
  }, [initial.userId]);

  const [picking, setPicking] = useState(false);
  const [opener] = useState(() => createOpener(initial.userId));
  const canAttend = features.atencionSinCita && ['admin', 'veterinario'].includes(snapshot.role);

  /**
   * Atender sin cita. Con señal la apertura va directo al servidor y se
   * navega a la visita real; sin señal nace en la copia local y la apertura
   * se encola para cuando vuelva la conexión.
   */
  async function attend(patient: PickedPatient) {
    setBusy(true); setProblem('');
    try {
      if (offline) {
        if (!patient.card) throw new Error('Este paciente no está en la copia del día.');
        const id = await startUnscheduledVisit(initial.userId, patient.card, snapshot.userName);
        const cached = await getDay(initial.userId);
        if (cached) setSnapshot(cached);
        setPicking(false);
        setSelected(id);
      } else {
        window.location.href = `/citas/${await opener(patient.id)}`;
      }
    } catch (e) {
      setPicking(false);
      setProblem(e instanceof Error ? e.message : 'No se pudo abrir la atención');
    } finally { setBusy(false); }
  }

  // Una visita abierta sin señal cambia de id al sincronizar: si la que está
  // en pantalla desapareció de la copia, se busca su número real.
  useEffect(() => {
    if (!selected || selected > 0 || snapshot.visits.some((v) => v.id === selected)) return;
    resolveVisitAlias(initial.userId, selected).then((real) => { if (real) setSelected(real); }).catch(() => {});
  }, [selected, snapshot, initial.userId]);

  async function prepare() {
    setBusy(true); setNotice(''); setProblem('');
    try {
      const fresh = await prepareDay(initial.userId);
      setSnapshot(fresh);
      setNotice('Jornada preparada en este dispositivo.');
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'No se pudo preparar la jornada');
    } finally { setBusy(false); }
  }

  async function syncNow() {
    setBusy(true); setNotice(''); setProblem('');
    try {
      const before = sync.pending.length;
      await sync.sync();
      if (navigator.onLine) {
        const response = await fetch('/api/jornada');
        if (response.ok) {
          const fresh: DaySnapshot = await response.json();
          // Esta relectura no trae el directorio (solo lo trae «Preparar sin
          // conexión»): se conserva el que ya había para seguir atendiendo sin cita.
          if (fresh.userId === initial.userId) setSnapshot((current) => ({ ...fresh, directory: fresh.directory ?? current.directory }));
        }
      }
      if (before) setNotice(`Se intentó enviar ${before} guardado(s). Revisa abajo los que quedaron pendientes.`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'No se pudo sincronizar');
    } finally { setBusy(false); }
  }

  if (!identityValid) return <p role="alert">La sesión de este dispositivo cambió. <a className="text-primary underline" href="/dashboard">Abre tu jornada actual</a>.</p>;
  if (selected && snapshot.visits.some((v) => v.id === selected)) {
    return <VisitWorkspace key={selected} initial={snapshot} visitId={selected} onBack={() => setSelected(undefined)} />;
  }

  const open = (visit: VisitSnapshot, label: string, variant = button) => offline
    ? <button className={variant} onClick={() => setSelected(visit.id)}>{label}</button>
    : <a className={variant} href={`/citas/${visit.id}`}>{label}</a>;

  const visible = snapshot.visits.filter((v) => filter === 'all' || !['completada', 'cancelada', 'no_asistio'].includes(v.status));
  const currentAddress = current ? current.visitAddress || current.owner.address : null;
  const currentPending = current ? pendingByVisit.get(current.id) : undefined;

  return <div className="mx-auto max-w-6xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-sm text-muted-foreground">{snapshot.role === 'veterinario' ? 'Tu jornada a domicilio' : 'Jornada del equipo'}</p>
        <h2 className="mt-1 text-2xl font-semibold">{snapshot.day === clinicDay() ? 'Hoy' : snapshot.day}, {snapshot.userName.split(' ')[0]}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{clinicDateLabel(snapshot.day)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {canAttend && <button className={button} disabled={busy} onClick={() => setPicking(true)}>Atender sin cita</button>}
        {!offline && <a className={button} href="/citas/nueva">+ Agendar visita</a>}
        <button className={button} disabled={busy} onClick={prepare}>{busy ? 'Preparando…' : 'Preparar sin conexión'}</button>
      </div>
    </div>

    {/* ── La visita en curso o la siguiente: dirección, hora, acción y
        estado de guardado en un solo bloque, antes de cualquier métrica. */}
    {current ? (
      <section className="rounded-2xl bg-primary p-5 text-primary-foreground sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-wider opacity-80">
            {current.status === 'en_curso' ? 'Atención en curso' : 'Siguiente visita'}
          </p>
          {currentPending && (
            <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium">
              {currentPending.blocked ? 'Necesita revisión' : 'Guardado sin enviar'}
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-2xl font-semibold">{current.patient.name} <span className="font-normal opacity-80">· {clinicHhmm(current.scheduledAt)}</span></h3>
            <p className="mt-2 text-sm">{currentAddress || 'Completar dirección'}</p>
            <p className="mt-1 text-sm opacity-90">{current.owner.firstName} {current.owner.lastName} · {current.reason || current.type}</p>
          </div>
          {open(current, nextActionLabel(current, current.records.some((r) => r.appointmentId === current.id)), `${button} bg-background text-foreground border-background`)}
        </div>
        {/* Llegar y contactar quedan siempre disponibles, sin abrir la visita. */}
        <div className="mt-4 flex flex-wrap gap-2">
          {currentAddress && <a className={`${button} border-white/40 text-primary-foreground`} target="_blank" rel="noreferrer" href={googleMapsUrl(currentAddress)}>Cómo llegar ↗</a>}
          {current.owner.phone && <a className={`${button} border-white/40 text-primary-foreground`} href={`tel:${current.owner.phone}`}>Llamar</a>}
        </div>
      </section>
    ) : (
      <section className="rounded-2xl border bg-card p-6">
        <h3 className="font-semibold">Tu jornada está al día</h3>
        <p className="mt-1 text-sm text-muted-foreground">No quedan visitas pendientes para esta fecha.</p>
      </section>
    )}

    {/* ── Un solo bloque de avisos: preparación, sincronización y cobertura. */}
    <div className="space-y-3">
      {offline && <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
        Copia local del {snapshot.day}, preparada a las {clinicTime(snapshot.preparedAt)}.{' '}
        {snapshot.day !== clinicDay() ? 'Esta jornada es de otro día; actualízala cuando recuperes señal.' : 'Los cambios se enviarán al recuperar conexión.'}
      </p>}
      {problem && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">{problem}</p>}
      {updateReady && (
        <p className="rounded-xl border bg-muted p-4 text-sm">
          Hay una versión nueva lista. Se aplicará sola cuando no queden guardados pendientes en este dispositivo.
        </p>
      )}
      {notice && <p role="status" className="rounded-xl border bg-muted p-4 text-sm">{notice}</p>}
      <CoverageNotice snapshot={snapshot} />
      <SyncCenter pending={sync.pending} busy={busy || sync.syncing} onSync={syncNow} onOpenVisit={offline ? (id) => setSelected(id) : undefined} />
    </div>

    {features.pendientes && <DayTasks day={snapshot.day} offline={offline} />}

    <section className="rounded-xl border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="font-semibold">Visitas del día</h3>
        <button className="min-h-11 text-sm text-primary" onClick={() => setFilter(filter === 'all' ? 'active' : 'all')}>
          {filter === 'all' ? 'Ver pendientes' : 'Ver todas'}
        </button>
      </div>
      <div className="space-y-3">
        {visible.map((visit) => {
          const queued = pendingByVisit.get(visit.id);
          return (
            <article key={visit.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
              <div className="min-w-0">
                <p className="font-medium">{clinicHhmm(visit.scheduledAt)} · {visit.patient.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{visit.visitAddress || visit.owner.address || 'Sin dirección'}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <VisitStatusBadge status={visit.status} />
                  {visit.origin && visit.origin !== 'agendada' && <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{visit.origin === 'pasada' ? 'Consulta pasada' : 'Sin cita'}</span>}
                  {queued && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">{queued.blocked ? 'Necesita revisión' : 'Guardado sin enviar'}</span>}
                  {snapshot.role !== 'veterinario' && <span className="text-xs text-muted-foreground">{visit.veterinarianName}</span>}
                </div>
              </div>
              {open(visit, nextActionLabel(visit, visit.records.some((r) => r.appointmentId === visit.id)))}
            </article>
          );
        })}
        {!visible.length && <p className="py-6 text-sm text-muted-foreground">No hay visitas en esta vista.</p>}
      </div>
    </section>

    {/* Las métricas van después del trabajo del día: informan, no deciden. */}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {([['Por atender', metrics.active], ['Completadas', metrics.completed], ['Saldo de estas visitas', `$${metrics.due.toLocaleString('es-CL')}`], ['Atención promedio', metrics.averageMinutes === null ? 'Sin registros' : `${metrics.averageMinutes} min`]] as const).map(([label, value]) => (
        <div key={label} className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-2 text-xl font-semibold">{value}</p>
        </div>
      ))}
    </div>
    <p className="text-xs text-muted-foreground">El tiempo promedio considera las visitas con inicio y cierre registrados. Los saldos corresponden a las visitas de esta jornada.</p>
    {picking && <PatientPicker offline={offline} directory={snapshot.directory} busy={busy} onPick={attend} onClose={() => setPicking(false)} />}
  </div>;
}
