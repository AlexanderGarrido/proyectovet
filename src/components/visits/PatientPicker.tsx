import { useEffect, useState } from 'react';
import type { PatientCard } from '../../lib/visit-types';

export interface PickedPatient { id: number; name: string; card?: PatientCard }

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Elige a quién atender sin cita. Con señal busca en el servidor (la misma
 * búsqueda del directorio de pacientes); sin señal, en el directorio que
 * trajo la copia del día.
 */
export function PatientPicker({ offline, directory, busy, onPick, onClose }: {
  offline: boolean; directory?: PatientCard[]; busy?: boolean; onPick: (p: PickedPatient) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickedPatient[]>([]);
  const [state, setState] = useState<'idle' | 'buscando' | 'error'>('idle');

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setState('idle'); return; }
    if (offline) {
      const needle = normalize(q);
      setResults((directory ?? [])
        .filter((c) => normalize(`${c.name} ${c.owner.firstName} ${c.owner.lastName} ${c.owner.phone ?? ''}`).includes(needle))
        .slice(0, 20)
        .map((c) => ({ id: c.id, name: `${c.name} · ${c.owner.firstName} ${c.owner.lastName}`, card: c })));
      return;
    }
    const controller = new AbortController();
    setState('buscando');
    const timer = setTimeout(() => {
      fetch(`/api/patients?search=${encodeURIComponent(q)}&limit=20`, { signal: controller.signal })
        .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
        .then((rows: { id: number; name: string; isActive: boolean; ownerFirstName: string | null; ownerLastName: string | null }[]) => {
          setResults(rows.filter((r) => r.isActive).map((r) => ({ id: r.id, name: `${r.name} · ${r.ownerFirstName ?? ''} ${r.ownerLastName ?? ''}`.trim() })));
          setState('idle');
        })
        .catch(() => { if (!controller.signal.aborted) setState('error'); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, offline, directory]);

  const noDirectory = offline && !directory;
  return (
    <div role="dialog" aria-modal="true" aria-label="Atender sin cita" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-lg rounded-t-2xl bg-card p-5 sm:rounded-2xl" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Atender sin cita</h2>
          <button className="min-h-11 px-3 text-sm text-primary" onClick={onClose}>Cerrar</button>
        </div>
        {noDirectory
          ? <p className="text-sm text-muted-foreground">Esta copia no trae el directorio de pacientes. Con señal, vuelve a «Preparar sin conexión».</p>
          : <>
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Mascota, responsable o teléfono"
              aria-label="Buscar paciente" className="min-h-11 w-full rounded-lg border bg-background px-3 text-base" />
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {results.map((r) => (
                <li key={r.id}>
                  <button disabled={busy} className="min-h-11 w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50" onClick={() => onPick(r)}>{r.name}</button>
                </li>
              ))}
            </ul>
            {state === 'buscando' && <p role="status" className="mt-2 text-sm text-muted-foreground">Buscando…</p>}
            {state === 'error' && <p role="alert" className="mt-2 text-sm text-destructive">No se pudo buscar. Revisa tu conexión.</p>}
            {query.trim().length >= 2 && state === 'idle' && !results.length && <p className="mt-2 text-sm text-muted-foreground">Sin pacientes activos con ese dato.</p>}
          </>}
      </div>
    </div>
  );
}
