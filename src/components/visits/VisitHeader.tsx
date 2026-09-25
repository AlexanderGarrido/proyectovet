import { useEffect, useState } from 'react';
import type { VisitSnapshot } from '../../lib/visit-types';
import { clinicHhmm, CLINIC_TIME_ZONE } from '../../lib/clinic-time';
import { googleMapsUrl, wazeUrl } from '../../lib/maps';
import { buildWhatsappLink } from '../../lib/whatsapp';
import { VisitStatusBadge } from './VisitStatusBadge';

const button = 'inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50';

export interface PatientAlert {
  id: number; category: string; text: string; validUntil: string | null; author?: string | null;
}

const categoryLabel: Record<string, string> = {
  alergia: 'Alergia', conducta: 'Manejo', condicion: 'Condición', medicacion: 'Medicación', administrativa: 'Administrativa',
};

/**
 * Cabecera clínica: lo que hay que tener a la vista antes de tocar al
 * paciente — especie, peso con su fecha de medición, alertas registradas y
 * cuándo fue la última atención. Antes había que abrir la ficha en otra
 * pantalla y volver, perdiendo el borrador de la consulta.
 */
export function VisitHeader({ visit, alerts, alertsState }: {
  visit: VisitSnapshot;
  alerts: PatientAlert[];
  alertsState: 'cargando' | 'listo' | 'error' | 'sin-conexion';
}) {
  const address = visit.visitAddress || visit.owner.address;
  const lastRecord = visit.records.filter((r) => r.appointmentId !== visit.id)[0];
  // El peso de la ficha no dice cuándo se midió; si hay una consulta
  // reciente con peso, esa fecha es el dato honesto.
  const weighed = visit.records.find((r) => r.vitalSigns?.weight);

  return (
    <section className="rounded-2xl bg-primary p-5 text-primary-foreground print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm opacity-90">
            <span>{visit.origin === 'sin_cita'
              ? `Sin cita · desde las ${clinicHhmm(visit.scheduledAt)}`
              : visit.origin === 'pasada'
                ? `Consulta pasada · ${new Date(visit.scheduledAt).toLocaleDateString('es-CL', { timeZone: CLINIC_TIME_ZONE })} ${clinicHhmm(visit.scheduledAt)}`
                : `${clinicHhmm(visit.scheduledAt)} · ${visit.type}`}</span>
            <VisitStatusBadge status={visit.status} className="bg-white/20 text-primary-foreground" />
          </div>
          <h2 className="mt-1 text-2xl font-semibold">{visit.patient.name}</h2>
          <p className="mt-1 text-sm opacity-90">
            {visit.patient.species}{visit.patient.breed && ` · ${visit.patient.breed}`} · {visit.owner.firstName} {visit.owner.lastName}
          </p>
          <p className="mt-1 text-sm opacity-90">
            Peso: {visit.patient.weight ? `${visit.patient.weight} kg` : 'sin registro'}
            {weighed && ` · medido el ${new Date(weighed.date).toLocaleDateString('es-CL', { timeZone: CLINIC_TIME_ZONE })}`}
            {lastRecord && ` · última atención ${new Date(lastRecord.date).toLocaleDateString('es-CL', { timeZone: CLINIC_TIME_ZONE })}`}
          </p>
        </div>
        <a className="rounded-lg border border-white/40 px-3 py-2 text-sm" href={`/pacientes/${visit.patientId}`}>Ficha del paciente</a>
      </div>

      <AlertBanner alerts={alerts} state={alertsState} />

      <p className="mt-4 text-sm">{address || 'Dirección pendiente de completar'}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {address && <>
          <a className={`${button} bg-background text-foreground`} target="_blank" rel="noreferrer" href={googleMapsUrl(address)}>Abrir Maps ↗</a>
          <a className={`${button} border-white/40`} target="_blank" rel="noreferrer" href={wazeUrl(address)}>Waze ↗</a>
        </>}
        {visit.owner.phone && <>
          <a className={`${button} border-white/40`} href={`tel:${visit.owner.phone}`}>Llamar</a>
          <a className={`${button} border-white/40`} target="_blank" rel="noreferrer"
            href={buildWhatsappLink(visit.owner.phone, `Hola ${visit.owner.firstName}, soy de Alma Veterinaria. Te escribo por la visita de ${visit.patient.name}.`) || '#'}>WhatsApp ↗</a>
        </>}
      </div>
    </section>
  );
}

/**
 * «Sin alertas» y «no se pudieron cargar las alertas» llevan a decisiones
 * opuestas frente a un paciente que podría morder. Nunca se muestran como
 * lo mismo.
 */
function AlertBanner({ alerts, state }: { alerts: PatientAlert[]; state: 'cargando' | 'listo' | 'error' | 'sin-conexion' }) {
  if (state === 'cargando') return <p className="mt-3 text-sm opacity-80">Consultando alertas registradas…</p>;
  if (state === 'error') return <p role="alert" className="mt-3 rounded-lg bg-white/15 p-3 text-sm">No se pudieron cargar las alertas de este paciente. No asumas que no tiene.</p>;
  if (state === 'sin-conexion') return <p className="mt-3 rounded-lg bg-white/15 p-3 text-sm">Sin conexión: las alertas registradas no se pueden consultar en esta copia.</p>;
  if (!alerts.length) return <p className="mt-3 text-sm opacity-80">Sin alertas registradas para este paciente.</p>;

  return (
    <ul className="mt-3 space-y-1.5">
      {alerts.map((alert) => (
        <li key={alert.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-sm">
          <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs font-medium">{categoryLabel[alert.category] ?? alert.category}</span>
          <span>{alert.text}</span>
          {alert.validUntil && <span className="text-xs opacity-80">hasta {alert.validUntil}</span>}
          {alert.author && <span className="text-xs opacity-80">· registró {alert.author}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Carga de alertas con estados distinguibles; sin señal no inventa datos. */
export function usePatientAlerts(patientId: number) {
  const [alerts, setAlerts] = useState<PatientAlert[]>([]);
  const [state, setState] = useState<'cargando' | 'listo' | 'error' | 'sin-conexion'>('cargando');

  useEffect(() => {
    let active = true;
    if (!navigator.onLine) { setState('sin-conexion'); return; }
    fetch(`/api/patients/${patientId}/alerts`)
      .then((r) => { if (!r.ok) throw new Error('alertas'); return r.json(); })
      .then((data: PatientAlert[]) => { if (active) { setAlerts(data); setState('listo'); } })
      .catch(() => { if (active) setState(navigator.onLine ? 'error' : 'sin-conexion'); });
    return () => { active = false; };
  }, [patientId]);

  return { alerts, state };
}
