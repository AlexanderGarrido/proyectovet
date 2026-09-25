import { useState } from 'react';
import { createOpener } from '../../lib/open-visit-client';

/** Abre una atención sin cita para este paciente y lleva al espacio de visita. */
export function AttendNowButton({ userId, patientId }: { userId: string; patientId: number }) {
  const [opener] = useState(() => createOpener(userId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function attend() {
    setBusy(true); setError('');
    try { window.location.href = `/citas/${await opener(patientId)}`; }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo abrir la atención'); setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-1">
      <button onClick={attend} disabled={busy} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        {busy ? 'Abriendo…' : 'Atender ahora'}
      </button>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
