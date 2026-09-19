import { useState } from 'react';
import type { VisitSnapshot } from '../../lib/visit-types';
import { CLINIC_TIME_ZONE } from '../../lib/clinic-time';
import { PatientTimeline } from '../patients/PatientTimeline';

/**
 * Antecedentes durante la visita. Con señal se muestra la cronología
 * completa del paciente; sin ella, lo que alcanzó a entrar en la copia
 * descargada — declarándolo como copia parcial, no como historial
 * completo.
 */
export function VisitHistory({ visit, canMedical, offlineOnly }: {
  visit: VisitSnapshot;
  canMedical: boolean;
  offlineOnly: boolean;
}) {
  const [view, setView] = useState<'cronologia' | 'copia'>(offlineOnly ? 'copia' : 'cronologia');

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Antecedentes de {visit.patient.name}</h3>
        {!offlineOnly && (
          <div className="flex gap-1.5">
            {(['cronologia', 'copia'] as const).map((option) => (
              <button
                key={option} type="button" aria-pressed={view === option}
                onClick={() => setView(option)}
                className={`min-h-9 rounded-full border px-3 py-1 text-xs font-medium ${view === option ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {option === 'cronologia' ? 'Cronología completa' : 'Copia descargada'}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-sm">Peso en ficha: {visit.patient.weight ? `${visit.patient.weight} kg` : 'Sin registro'}</p>
      {visit.patient.notes && <p className="whitespace-pre-wrap text-sm">{visit.patient.notes}</p>}

      {view === 'cronologia' ? (
        <PatientTimeline patientId={visit.patientId} compact />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Copia descargada con esta jornada. Puede estar recortada: no la leas como el historial completo.
          </p>
          {visit.records.length ? visit.records.map((record) => (
            <article className="rounded-lg border p-3" key={record.id}>
              <p className="text-sm font-semibold">
                {record.reason} · {new Date(record.date).toLocaleDateString('es-CL', { timeZone: CLINIC_TIME_ZONE })}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{record.diagnosis || 'Sin diagnóstico registrado'}</p>
              {record.treatment && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{record.treatment}</p>}
            </article>
          )) : (
            <p className="text-sm text-muted-foreground">
              {canMedical ? 'Sin consultas previas en esta copia.' : 'Los antecedentes clínicos están disponibles para el veterinario.'}
            </p>
          )}
          <h4 className="font-semibold">Vacunas</h4>
          {visit.vaccines.length ? visit.vaccines.map((v, i) => (
            <p className="text-sm" key={i}>{v.name} · {v.applicationDate}{v.nextDoseDate && ` · Próxima: ${v.nextDoseDate}`}</p>
          )) : <p className="text-sm text-muted-foreground">Sin vacunas en esta copia.</p>}
        </div>
      )}

      <WeightTrend visit={visit} />
    </section>
  );
}

/**
 * Evolución del peso con fechas y omisiones a la vista. No interpreta: una
 * baja puede ser enfermedad, una dieta o dos balanzas distintas, y esa
 * lectura le corresponde al profesional, no a un gráfico.
 */
function WeightTrend({ visit }: { visit: VisitSnapshot }) {
  const points = visit.records
    .filter((r) => r.vitalSigns?.weight)
    .map((r) => ({ date: r.date, weight: Number(r.vitalSigns!.weight) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length < 2) {
    return <p className="text-xs text-muted-foreground">
      {points.length === 1 ? 'Un solo peso registrado en esta copia; no hay evolución que mostrar.' : 'Sin pesos registrados en esta copia.'}
    </p>;
  }

  const max = Math.max(...points.map((p) => p.weight));
  const min = Math.min(...points.map((p) => p.weight));
  const span = max - min || 1;

  return (
    <div>
      <h4 className="font-semibold">Evolución del peso</h4>
      <ul className="mt-2 space-y-1.5">
        {points.map((point) => (
          <li key={point.date} className="flex items-center gap-3 text-sm">
            <span className="w-24 shrink-0 text-xs text-muted-foreground">
              {new Date(point.date).toLocaleDateString('es-CL', { timeZone: CLINIC_TIME_ZONE, day: '2-digit', month: 'short', year: '2-digit' })}
            </span>
            <span className="h-2 rounded-full bg-primary" style={{ width: `${20 + ((point.weight - min) / span) * 60}%` }} aria-hidden />
            <span className="tabular-nums">{point.weight} kg</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Solo se muestran las mediciones registradas: entre dos puntos puede haber consultas sin peso anotado.
      </p>
    </div>
  );
}
