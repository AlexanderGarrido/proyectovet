import { useEffect, useState } from 'react';
import type { DaySnapshot, VisitSnapshot } from '../../lib/visit-types';
import { clinicDay, clinicTime, CLINIC_TIME_ZONE } from '../../lib/clinic-time';
import { FIELD_EVENT, getDay, listPending, prepareDay, syncPending } from '../../lib/field-storage';
import { useFieldIdentity } from './useFieldIdentity';
import { VisitWorkspace } from './VisitWorkspace';

const button = 'inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50';
const labels: Record<string, string> = { programada: 'Programada', confirmada: 'Confirmada', en_camino: 'En camino', en_curso: 'En atención', completada: 'Completada', cancelada: 'Cancelada', no_asistio: 'No realizada' };
export function dayMetrics(visits: VisitSnapshot[]) {
  const active = visits.filter((v) => !['cancelada', 'no_asistio', 'completada'].includes(v.status));
  const completed = visits.filter((v) => v.status === 'completada');
  const due = visits.flatMap((v) => v.invoices).filter((i) => i.status !== 'anulada').reduce((sum, i) => sum + Math.max(0, Number(i.total) - i.paid), 0);
  const durations = completed.filter((v) => v.startedAt && v.completedAt).map((v) => Math.max(0, (Date.parse(v.completedAt!) - Date.parse(v.startedAt!)) / 60000));
  return { active: active.length, completed: completed.length, due, averageMinutes: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null };
}
export function DayPanel({ initial, offline = false, initialVisitId }: { initial: DaySnapshot; offline?: boolean; initialVisitId?: number }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [selected, setSelected] = useState(initialVisitId);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const identityValid = useFieldIdentity(initial.userId);
  const metrics = dayMetrics(snapshot.visits);
  const current = snapshot.visits.find((v) => v.status === 'en_curso') || snapshot.visits.find((v) => !['completada', 'cancelada', 'no_asistio'].includes(v.status));
  useEffect(() => {
    const update = () => listPending(initial.userId).then(async (q) => { setPendingCount(q.length); if (offline) { const cached = await getDay(initial.userId); if (cached) setSnapshot(cached); } }).catch((e) => setNotice(e.message));
    update(); window.addEventListener(FIELD_EVENT, update); return () => window.removeEventListener(FIELD_EVENT, update);
  }, [initial.userId]);
  async function prepare() {
    setBusy(true); setNotice('');
    try { const fresh = await prepareDay(initial.userId); setSnapshot(fresh); setNotice('Jornada preparada. Puedes abrir las visitas y registrar atención sin conexión en este dispositivo.'); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'No se pudo preparar la jornada'); }
    finally { setBusy(false); }
  }
  async function sync() {
    setBusy(true);
    try { const result = await syncPending(initial.userId); setNotice(result.error || `${result.sent} visita(s) sincronizada(s). Revisa las que necesitan corrección.`); if (result.sent) { const response = await fetch('/api/jornada'); if (response.ok) { const fresh: DaySnapshot = await response.json(); if (fresh.userId === initial.userId) setSnapshot(fresh); } } }
    catch (e) { setNotice(e instanceof Error ? e.message : 'No se pudo sincronizar'); }
    finally { setBusy(false); }
  }
  if (!identityValid) return <p role="alert">La sesión de este dispositivo cambió. <a className="text-primary underline" href="/dashboard">Abre tu jornada actual</a>.</p>;
  if (selected && snapshot.visits.some((v) => v.id === selected)) return <VisitWorkspace key={selected} initial={snapshot} visitId={selected} onBack={() => setSelected(undefined)} />;
  const open = (visit: VisitSnapshot) => offline ? <button className={`${button} bg-primary text-primary-foreground`} onClick={() => setSelected(visit.id)}>Abrir visita</button> : <a className={`${button} bg-primary text-primary-foreground`} href={`/citas/${visit.id}`}>Abrir visita</a>;
  const visible = snapshot.visits.filter((v) => filter === 'all' || !['completada', 'cancelada', 'no_asistio'].includes(v.status));
  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-muted-foreground">{snapshot.role === 'veterinario' ? 'Tu jornada a domicilio' : 'Jornada del equipo'}</p><h2 className="mt-1 text-2xl font-semibold">{snapshot.day === clinicDay() ? 'Hoy' : snapshot.day}, {snapshot.userName.split(' ')[0]}</h2><p className="mt-1 text-sm text-muted-foreground">{new Date(`${snapshot.day}T12:00:00Z`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: CLINIC_TIME_ZONE })}</p></div><div className="flex flex-wrap gap-2"><a className={button} href="/citas/nueva">+ Agendar visita</a><button className={button} disabled={busy} onClick={prepare}>{busy ? 'Preparando…' : 'Preparar sin conexión'}</button></div></div>
    {offline && <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">Copia local del {snapshot.day}. Preparada a las {clinicTime(snapshot.preparedAt)}. {snapshot.day !== clinicDay() ? 'Esta jornada es de otro día; actualízala cuando recuperes señal.' : 'Los cambios se enviarán al recuperar conexión.'}</p>}
    {notice && <p role="status" className="rounded-xl border bg-muted p-4 text-sm">{notice}</p>}
    {pendingCount > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 p-4"><span className="text-sm">{pendingCount} guardado(s) pendiente(s) en este dispositivo</span><button disabled={busy} className={button} onClick={sync}>Sincronizar</button></div>}
    {current ? <section className="rounded-2xl bg-primary p-6 text-primary-foreground"><p className="text-xs font-medium uppercase tracking-wider opacity-80">{current.status === 'en_curso' ? 'Atención en curso' : 'Siguiente visita pendiente'}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-4"><div><h3 className="text-2xl font-semibold">{current.patient.name} <span className="font-normal opacity-80">· {clinicTime(current.scheduledAt)}</span></h3><p className="mt-2 text-sm">{current.visitAddress || current.owner.address || 'Completar dirección'} · {current.owner.firstName} {current.owner.lastName}</p><p className="mt-1 text-sm opacity-80">{current.reason || current.type}</p></div>{open(current)}</div></section> : <section className="rounded-2xl border bg-card p-6"><h3 className="font-semibold">Tu jornada está al día</h3><p className="mt-1 text-sm text-muted-foreground">No quedan visitas pendientes para esta fecha.</p></section>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Por atender', metrics.active], ['Completadas', metrics.completed], ['Saldo de estas visitas', `$${metrics.due.toLocaleString('es-CL')}`], ['Atención promedio', metrics.averageMinutes === null ? 'Sin registros' : `${metrics.averageMinutes} min`]].map(([label, value]) => <div key={label} className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>)}</div>
    <section className="rounded-xl border bg-card p-5"><div className="mb-4 flex items-center justify-between gap-2"><h3 className="font-semibold">Visitas del día</h3><button className="min-h-11 text-sm text-primary" onClick={() => setFilter(filter === 'all' ? 'active' : 'all')}>{filter === 'all' ? 'Ver pendientes' : 'Ver todas'}</button></div><div className="space-y-3">{visible.map((visit) => <article key={visit.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><p className="font-medium">{clinicTime(visit.scheduledAt)} · {visit.patient.name}</p><p className="mt-1 text-sm text-muted-foreground">{visit.visitAddress || visit.owner.address || 'Sin dirección'} · {labels[visit.status] || visit.status}</p>{snapshot.role !== 'veterinario' && <p className="mt-1 text-xs text-muted-foreground">{visit.veterinarianName}</p>}</div>{open(visit)}</article>)}{!visible.length && <p className="py-6 text-sm text-muted-foreground">No hay visitas en esta vista.</p>}</div></section>
    <p className="text-xs text-muted-foreground">El tiempo promedio considera las visitas con inicio y cierre registrados. Los saldos corresponden a las visitas de esta jornada.</p>
  </div>;
}
