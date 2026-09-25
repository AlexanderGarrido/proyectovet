import { useState } from 'react';
import { createOpener } from '../../lib/open-visit-client';
import { fromClinicInput, toClinicInput } from '../../lib/clinic-time';

/**
 * Registrar una consulta que ya ocurrió, con el mismo espacio de atención
 * que «Atender ahora»: se elige cuándo fue (en horario de la clínica) y se
 * abre la visita con esa fecha, para nota, insumos, cobro y cierre.
 */
export function PastConsultButton({ userId, patientId }: { userId: string; patientId: number }) {
  const [opener] = useState(() => createOpener(userId));
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const max = toClinicInput(new Date()).slice(0, 16);

  async function start() {
    setBusy(true); setError('');
    try {
      if (!when) throw new Error('Elige la fecha y hora de la consulta.');
      window.location.href = `/citas/${await opener(patientId, { origin: 'pasada', occurredAt: fromClinicInput(when) })}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la consulta pasada');
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="min-h-11 text-sm text-muted-foreground hover:underline">Registrar consulta pasada</button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Registrar consulta pasada" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl bg-card p-5 sm:rounded-2xl" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Registrar consulta pasada</h2>
              <button className="min-h-11 px-3 text-sm text-primary" onClick={() => setOpen(false)}>Cerrar</button>
            </div>
            <label className="block text-sm font-medium" htmlFor="past-consult-when">¿Cuándo fue la consulta?</label>
            <input id="past-consult-when" type="datetime-local" max={max} value={when} onChange={(e) => setWhen(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3 text-base" />
            <p className="mt-2 text-xs text-muted-foreground">Se abre la misma pantalla de atención: nota, insumos, cobro y cierre, con esta fecha.</p>
            {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
            <button onClick={start} disabled={busy || !when} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {busy ? 'Abriendo…' : 'Continuar'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
