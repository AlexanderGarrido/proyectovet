import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '../ui/error-state';

const field = 'w-full rounded-lg border bg-background px-3 py-2.5 text-base sm:text-sm';
const button = 'inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50';

interface Alert {
  id: number; category: string; text: string; validUntil: string | null;
  createdAt: string; resolvedAt: string | null; author?: string | null;
}

const CATEGORIES = [
  ['alergia', 'Alergia'],
  ['conducta', 'Manejo'],
  ['condicion', 'Condición'],
  ['medicacion', 'Medicación'],
  ['administrativa', 'Administrativa'],
] as const;

const categoryLabel = Object.fromEntries(CATEGORIES) as Record<string, string>;

/**
 * Alertas del paciente en su ficha. Se muestran de forma explícita porque
 * son lo que cambia cómo se aborda una visita, y la ausencia de alertas se
 * enuncia como «nadie registró ninguna» — no como una afirmación sobre el
 * paciente. Retirar una alerta la marca resuelta con autor y fecha.
 */
export function PatientAlertsPanel({ patientId, canEdit }: { patientId: number; canEdit: boolean }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [state, setState] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ category: 'conducta', text: '', validUntil: '' });

  function load() {
    setState('cargando');
    fetch(`/api/patients/${patientId}/alerts`)
      .then((r) => { if (!r.ok) throw new Error('alertas'); return r.json(); })
      .then((data: Alert[]) => { setAlerts(data); setState('listo'); })
      .catch(() => setState('error'));
  }
  useEffect(load, [patientId]);

  async function create() {
    if (form.text.trim().length < 3) { toast.error('Describe la alerta en al menos tres caracteres'); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/patients/${patientId}/alerts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: form.category, text: form.text.trim(), validUntil: form.validUntil || null }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'No se pudo registrar la alerta');
      setForm({ category: 'conducta', text: '', validUntil: '' });
      setAdding(false);
      load();
      toast.success('Alerta registrada');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo registrar la alerta'); }
    finally { setBusy(false); }
  }

  async function resolve(id: number) {
    setBusy(true);
    try {
      const response = await fetch(`/api/patients/${patientId}/alerts?alertId=${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('No se pudo retirar la alerta');
      load();
      toast.success('Alerta marcada como resuelta; queda en el historial');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo retirar la alerta'); }
    finally { setBusy(false); }
  }

  if (state === 'error') {
    return <ErrorState className="rounded-xl border bg-card" title="No se pudieron cargar las alertas" description="No asumas que este paciente no tiene alertas registradas." onRetry={load} />;
  }

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Alertas del paciente</h3>
        {canEdit && (
          <button type="button" className="min-h-11 text-sm text-primary" onClick={() => setAdding((a) => !a)}>
            {adding ? 'Cancelar' : '+ Registrar alerta'}
          </button>
        )}
      </div>

      {state === 'cargando' ? (
        <p className="mt-2 text-sm text-muted-foreground">Consultando alertas…</p>
      ) : alerts.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nadie registró alertas para este paciente.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {alerts.map((alert) => (
            <li key={alert.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{categoryLabel[alert.category] ?? alert.category}</span>
              <span className="flex-1">{alert.text}</span>
              {alert.validUntil && <span className="text-xs text-muted-foreground">hasta {alert.validUntil}</span>}
              {alert.author && <span className="text-xs text-muted-foreground">{alert.author}</span>}
              {canEdit && (
                <button type="button" disabled={busy} className="min-h-9 text-xs text-primary" onClick={() => resolve(alert.id)}>
                  Marcar resuelta
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && canEdit && (
        <div className="mt-3 grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
          <label className="text-sm">
            Categoría
            <select className={`${field} mt-1`} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            Qué debe saber quien atienda
            <input className={`${field} mt-1`} maxLength={300} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
          </label>
          <label className="text-sm">
            Vigente hasta (opcional)
            <input className={`${field} mt-1`} type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
          </label>
          <div className="flex items-end sm:col-span-2">
            <button type="button" className={`${button} bg-primary text-primary-foreground`} disabled={busy} onClick={create}>
              {busy ? 'Guardando…' : 'Registrar alerta'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
