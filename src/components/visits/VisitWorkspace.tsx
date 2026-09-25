import { useState } from 'react';
import type { DaySnapshot, VisitSnapshot } from '../../lib/visit-types';
import { useVisitDraft } from './useVisitDraft';
import { VisitHeader, usePatientAlerts } from './VisitHeader';
import { ClinicalNote } from './ClinicalNote';
import { VisitHistory } from './VisitHistory';
import { VisitCheckout } from './VisitCheckout';
import { VisitSummary } from './VisitSummary';
import { FollowupComposer } from '../common/FollowupComposer';

const button = 'inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50';

const SECTIONS = [
  ['atencion', 'Atención'],
  ['antecedentes', 'Antecedentes'],
  ['cierre', 'Cobro y cierre'],
  ['resumen', 'Resumen'],
] as const;

/**
 * Espacio de atención. Este archivo reunía interfaz, borrador,
 * sincronización y cierre; ahora solo compone: el estado del borrador y
 * las operaciones viven en `useVisitDraft`, y cada sección es su propia
 * vista. La semántica de guardado no cambió — mismo UUID por operación,
 * misma cola y mismo endpoint.
 */
export function VisitWorkspace({ initial, visitId, onBack }: { initial: DaySnapshot; visitId: number; onBack?: () => void }) {
  const controller = useVisitDraft(initial, visitId);
  const {
    visit, draft, canMedical, closed, ownRecords, error, busy, photosBusy, pending, pendingStatus,
    ready, savedAt, online, identityValid, clinicalChanged, dirty, submit, sync, correctPending, saveDraftNow,
  } = controller;
  const [section, setSection] = useState<(typeof SECTIONS)[number][0]>('atencion');
  const { alerts, state: alertsState } = usePatientAlerts(visit.patientId);

  async function back() {
    try { await saveDraftNow(); onBack?.(); }
    catch (e) { controller.setError(e instanceof Error ? e.message : 'No se pudo guardar el borrador. Conserva esta pantalla.'); }
  }

  // Una apertura pendiente no trae nota: la nota provisional sale del borrador.
  const pendingRecord = pending && pending.operation.action !== 'open' ? pending.operation.record : undefined;
  const provisionalRecord = pendingRecord || (clinicalChanged ? {
    reason: draft.reason || visit.reason || 'Atención a domicilio', subjective: draft.subjective,
    diagnosis: draft.diagnosis, treatment: draft.treatment, observations: draft.observations,
  } : null);
  const summaryVisit: VisitSnapshot = provisionalRecord ? {
    ...visit,
    records: [...visit.records, {
      id: -1, appointmentId: visit.id, patientId: visit.patientId, date: pending?.createdAt || new Date().toISOString(),
      reason: provisionalRecord.reason, subjective: provisionalRecord.subjective || null, diagnosis: provisionalRecord.diagnosis || null,
      treatment: provisionalRecord.treatment || null, observations: provisionalRecord.observations || null, vitalSigns: null,
    }],
  } : visit;

  if (!identityValid) return <p role="alert">La sesión cambió. <a href="/dashboard" className="text-primary underline">Abre tu jornada actual</a>.</p>;

  return (
    // pb-40 reserva la altura de la barra de acciones y de la navegación
    // inferior: sin eso, el último campo del formulario queda debajo.
    <div className="mx-auto max-w-5xl space-y-5 pb-40">
      <div className="flex items-center justify-between gap-3 print:hidden">
        {onBack
          ? <button className="min-h-11 text-sm text-primary" onClick={back}>← Mi jornada</button>
          : <a className="min-h-11 text-sm text-primary" href="/dashboard">← Mi jornada</a>}
        <a className="min-h-11 text-sm text-primary" href={`/citas/${visitId}/editar`}>Editar agenda</a>
      </div>

      <VisitHeader visit={visit} alerts={alerts} alertsState={alertsState} />

      {error && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100 print:hidden">{error}</div>}

      {pending && (
        <section className="rounded-xl border bg-card p-4 print:hidden">
          <h3 className="font-semibold">{pending.blocked ? 'El guardado necesita revisión' : 'Cambios pendientes en este dispositivo'}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {pending.error || 'Conservamos la consulta para enviarla sin duplicar insumos ni cobros.'}
          </p>
          {pending.outcome === 'incierto' && (
            <p className="mt-1 text-sm">
              No sabemos si el servidor alcanzó a aplicarla. Se reenvía con el mismo identificador; no crees una operación nueva para reemplazarla.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={button} disabled={busy || pending.blocked} onClick={sync}>Sincronizar ahora</button>
            {pending.blocked && <button className={button} disabled={busy} onClick={correctPending}>Revisar versión actual y corregir</button>}
          </div>
        </section>
      )}

      <nav aria-label="Pasos de la visita" className="flex gap-2 overflow-x-auto print:hidden">
        {SECTIONS.map(([id, label]) => (
          <button
            key={id} onClick={() => setSection(id)} aria-current={section === id ? 'step' : undefined}
            className={`${button} shrink-0 ${section === id ? 'bg-primary text-primary-foreground' : 'bg-card'}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {section === 'antecedentes' && (
        <VisitHistory visit={visit} canMedical={canMedical} offlineOnly={!online} />
      )}

      {section === 'atencion' && (
        <section className="space-y-5 rounded-xl border bg-card p-5 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Atención de la visita</h3>
            {!closed && (
              <div className="flex gap-2">
                <button className={button} disabled={busy || !!pending || visit.status === 'en_curso' || visit.status === 'en_camino' || dirty} onClick={() => submit('travel')}>En camino</button>
                <button className={`${button} bg-primary text-primary-foreground`} disabled={busy || !!pending || visit.status === 'en_curso' || dirty} onClick={() => submit('start')}>Iniciar atención</button>
              </div>
            )}
          </div>
          <ClinicalNote controller={controller} />
          {canMedical && (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <a className={button} href={`/recetas/nueva?${controller.context}`}>Crear receta</a>
              <a className={button} href={`/ordenes/nueva?${controller.context}`}>Orden de laboratorio</a>
              <a className={button} href={`/consentimientos/nueva?${controller.context}`}>Consentimiento</a>
            </div>
          )}
        </section>
      )}

      {section === 'cierre' && <VisitCheckout controller={controller} />}
      {section === 'resumen' && (
        <>
          <VisitSummary visit={summaryVisit} provisional={Boolean(provisionalRecord)} />
          {online && (
            <FollowupComposer
              patientId={visit.patientId}
              appointmentId={visit.id}
              ownerName={visit.owner.firstName}
              patientName={visit.patient.name}
              phone={visit.owner.phone}
              instructions={summaryVisit.records.find((r) => r.appointmentId === visit.id)?.treatment ?? undefined}
              veterinarianName={visit.veterinarianName ?? undefined}
            />
          )}
        </>
      )}

      {/* Barra de acciones fija. Se ubica sobre la navegación inferior del
          teléfono (no encima de ella) y respeta el área segura, para que el
          botón de cierre nunca quede tapado por los gestos del sistema. */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-card p-3 shadow-lg print:hidden lg:sticky lg:inset-auto lg:rounded-xl lg:border"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 3.75rem)' }}
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground" role="status">
            {pending
              ? pending.blocked ? 'Guardado en el dispositivo · necesita revisión' : 'Guardado en el dispositivo · falta enviar'
              : savedAt || 'Los cambios se guardan como borrador en este dispositivo'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button className={button} disabled={busy || photosBusy || (!!pending && !pendingStatus) || !ready} onClick={() => submit('save')}>
              {busy ? 'Guardando…' : online ? 'Guardar cambios' : 'Guardar borrador'}
            </button>
            {canMedical && !closed && (
              <button
                className={`${button} bg-primary text-primary-foreground`}
                disabled={busy || photosBusy || (!!pending && !pendingStatus) || !ready}
                onClick={() => { if (section !== 'cierre') setSection('cierre'); else submit('complete'); }}
              >
                {section === 'cierre' ? 'Guardar y cerrar visita' : 'Continuar al cierre'}
              </button>
            )}
          </div>
        </div>
      </div>
      {ownRecords.length > 0 && closed && (
        <p className="text-xs text-muted-foreground print:hidden">
          Esta visita está cerrada. Una corrección se registra como adenda con autor y fecha; la nota original se conserva.
        </p>
      )}
    </div>
  );
}
