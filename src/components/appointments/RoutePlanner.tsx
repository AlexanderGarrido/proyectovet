import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { RouteDayView } from '../../lib/routes';
import { addClinicDays, clinicDateLabel, clinicDay, clinicHhmm } from '../../lib/clinic-time';
import { googleMapsUrl } from '../../lib/maps';
import { ErrorState } from '../ui/error-state';
import { VisitStatusBadge } from '../visits/VisitStatusBadge';

const field = 'w-full rounded-lg border bg-background px-3 py-2.5 text-base sm:text-sm';
const button = 'inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50';
const money = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/**
 * Recorrido del día: paradas en orden, con su traslado declarado y las
 * visitas que ocurren en cada domicilio.
 *
 * Dos decisiones deliberadas: nada se agrupa solo —el operador elige qué
 * visitas comparten parada, porque el mismo apellido no implica la misma
 * casa— y reordenar cambia el orden del recorrido, nunca el horario de una
 * cita confirmada.
 */
export function RoutePlanner({ veterinarianId }: { veterinarianId?: string }) {
  const [day, setDay] = useState(() => clinicDay());
  const [route, setRoute] = useState<RouteDayView | null>(null);
  const [state, setState] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<number[]>([]);
  const [form, setForm] = useState({ address: '', sector: '', travelMinutes: 0, travelFee: 0, travelChargedTo: 0 });

  const load = useCallback(async () => {
    setState('cargando');
    try {
      const params = new URLSearchParams({ day });
      if (veterinarianId) params.set('veterinarianId', veterinarianId);
      const response = await fetch(`/api/routes?${params}`);
      if (!response.ok) throw new Error('recorrido');
      setRoute(await response.json());
      setState('listo');
    } catch { setState('error'); }
  }, [day, veterinarianId]);

  useEffect(() => { load(); setSelection([]); }, [load]);

  async function createStop() {
    if (!route) return;
    if (!selection.length) { toast.error('Selecciona las visitas que comparten domicilio'); return; }
    if (form.address.trim().length < 3) { toast.error('Indica la dirección de la parada'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/routes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day, veterinarianId: route.veterinarianId, address: form.address.trim(),
          sector: form.sector.trim() || null, travelMinutes: Number(form.travelMinutes) || 0,
          travelFee: Number(form.travelFee) || 0,
          travelChargedTo: form.travelChargedTo || selection[0],
          appointmentIds: selection,
        }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'No se pudo crear la parada');
      setSelection([]);
      setForm({ address: '', sector: '', travelMinutes: 0, travelFee: 0, travelChargedTo: 0 });
      await load();
      toast.success('Parada creada');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo crear la parada'); }
    finally { setBusy(false); }
  }

  async function move(index: number, delta: number) {
    if (!route) return;
    const ids = route.stops.map((s) => s.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setBusy(true);
    try {
      const response = await fetch('/api/routes', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day, veterinarianId: route.veterinarianId, stopIds: ids }),
      });
      if (!response.ok) throw new Error('No se pudo reordenar');
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo reordenar'); }
    finally { setBusy(false); }
  }

  if (state === 'error') return <ErrorState title="No se pudo cargar el recorrido" onRetry={load} />;

  const totalTravel = route?.stops.reduce((sum, s) => sum + s.travelMinutes, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className={button} onClick={() => setDay((d) => addClinicDays(d, -1))} aria-label="Día anterior">←</button>
        <input className={`${field} w-auto`} type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Día del recorrido" />
        <button className={button} onClick={() => setDay((d) => addClinicDays(d, 1))} aria-label="Día siguiente">→</button>
        <span className="text-sm capitalize text-muted-foreground">{clinicDateLabel(day)}</span>
        {totalTravel > 0 && <span className="text-sm text-muted-foreground">· {totalTravel} min de traslado declarados</span>}
      </div>

      {state === 'cargando' || !route ? (
        <p className="text-sm text-muted-foreground">Cargando recorrido…</p>
      ) : (
        <>
          <section className="space-y-3">
            <h3 className="font-semibold">Paradas</h3>
            {route.stops.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay paradas para este día.</p>}
            {route.stops.map((stop, index) => (
              <article key={stop.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{index + 1}. {stop.address}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {stop.sector ? `Sector ${stop.sector} · ` : ''}{stop.travelMinutes} min de traslado
                      {Number(stop.travelFee) > 0 && ` · traslado ${money(Number(stop.travelFee))} atribuido a la visita #${stop.travelChargedTo}`}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <a className={button} target="_blank" rel="noreferrer" href={googleMapsUrl(stop.address)}>Maps ↗</a>
                    <button className={button} disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={`Subir parada ${index + 1}`}>↑</button>
                    <button className={button} disabled={busy || index === route.stops.length - 1} onClick={() => move(index, 1)} aria-label={`Bajar parada ${index + 1}`}>↓</button>
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {stop.visits.map((visit) => (
                    <li key={visit.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
                      <span className="tabular-nums">{clinicHhmm(visit.scheduledAt)}</span>
                      <a className="font-medium text-primary underline-offset-2 hover:underline" href={`/citas/${visit.id}`}>{visit.patientName}</a>
                      <span className="text-muted-foreground">{visit.ownerName}</span>
                      <VisitStatusBadge status={visit.status} />
                      {stop.travelChargedTo === visit.id && Number(stop.travelFee) > 0 && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Traslado en esta visita</span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  Cada mascota conserva su propia consulta y su propio cobro. El traslado se atribuye a una sola visita del grupo.
                </p>
              </article>
            ))}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h3 className="font-semibold">Agrupar visitas en una parada</h3>
            {route.unassigned.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">Todas las visitas del día ya pertenecen a una parada.</p>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  Marca las visitas que ocurren en el mismo domicilio. Nada se agrupa automáticamente.
                </p>
                <ul className="mt-3 space-y-1.5">
                  {route.unassigned.map((visit) => (
                    <li key={visit.id}>
                      <label className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
                        <input
                          type="checkbox" checked={selection.includes(visit.id)}
                          onChange={(e) => setSelection((current) => (e.target.checked ? [...current, visit.id] : current.filter((id) => id !== visit.id)))}
                        />
                        <span className="tabular-nums">{clinicHhmm(visit.scheduledAt)}</span>
                        <span className="font-medium">{visit.patientName}</span>
                        <span className="text-muted-foreground">{visit.ownerName}</span>
                      </label>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="text-sm sm:col-span-2">
                    Dirección de la parada
                    <input className={`${field} mt-1`} value={form.address} maxLength={500} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                  </label>
                  <label className="text-sm">
                    Sector
                    <input className={`${field} mt-1`} value={form.sector} maxLength={80} onChange={(e) => setForm({ ...form, sector: e.target.value })} />
                  </label>
                  <label className="text-sm">
                    Colchón de traslado (min)
                    <input className={`${field} mt-1`} type="number" min="0" max="600" value={form.travelMinutes} onChange={(e) => setForm({ ...form, travelMinutes: Number(e.target.value) })} />
                  </label>
                  <label className="text-sm">
                    Cobro del traslado (CLP)
                    <input className={`${field} mt-1`} type="number" min="0" value={form.travelFee} onChange={(e) => setForm({ ...form, travelFee: Number(e.target.value) })} />
                  </label>
                  <label className="text-sm">
                    Visita que asume el traslado
                    <select className={`${field} mt-1`} value={form.travelChargedTo} onChange={(e) => setForm({ ...form, travelChargedTo: Number(e.target.value) })}>
                      <option value={0}>La primera seleccionada</option>
                      {route.unassigned.filter((v) => selection.includes(v.id)).map((v) => (
                        <option key={v.id} value={v.id}>{v.patientName} · {v.ownerName}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  El traslado no se reparte entre responsables distintos: queda visible en la visita que lo asume.
                </p>
                <button className={`${button} mt-3 bg-primary text-primary-foreground`} disabled={busy} onClick={createStop}>
                  {busy ? 'Guardando…' : 'Crear parada con lo seleccionado'}
                </button>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
