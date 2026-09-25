import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { DaySnapshot, QueuedOperation, VisitOperation, VisitSnapshot } from '../../lib/visit-types';
import {
  FIELD_EVENT, getDay, listPending, loadFieldDraft, queueVisit, removePending,
  saveFieldDraft, syncPending, type QueuedVisit,
} from '../../lib/field-storage';
import { useFieldIdentity } from './useFieldIdentity';
import { clinicTime } from '../../lib/clinic-time';

export interface VisitDraft {
  reason: string; subjective: string; diagnosis: string; treatment: string; observations: string;
  weight: string; temperature: string; heartRate: string; respiratoryRate: string;
  supplies: { productId: number; quantity: number; locationId: number | null }[];
  photos: string[];
  amount: string; description: string; payment: string;
  method: 'efectivo' | 'transferencia' | 'tarjeta' | 'otro';
  noCharge: boolean;
  /** Plantilla elegida y su versión al momento de redactar. */
  templateId?: number | null;
  templateVersion?: number | null;
  /** Prestaciones seleccionadas del catálogo (formato 2 de la operación). */
  items: { serviceId: number; quantity: number; performed: boolean }[];
  /** Corrección sobre una visita ya cerrada: texto y registro corregido. */
  amendment: string;
  amendsRecordId: number | null;
}

export function emptyDraft(visit: VisitSnapshot): VisitDraft {
  return {
    reason: '', subjective: '', diagnosis: '', treatment: '', observations: '',
    weight: '', temperature: '', heartRate: '', respiratoryRate: '',
    supplies: [], photos: [],
    amount: '', description: visit.reason || 'Atención veterinaria a domicilio',
    payment: '', method: 'efectivo', noCharge: visit.noCharge ?? false,
    templateId: null, templateVersion: null, items: [],
    amendment: '', amendsRecordId: null,
  };
}

/**
 * Controlador del espacio de atención. `VisitWorkspace` reunía interfaz,
 * borrador, cola de sincronización y cierre en un solo archivo: cualquier
 * ajuste visual obligaba a tocar el código que decide si un guardado se
 * envía o se conserva. Aquí vive solo esa segunda parte — el estado del
 * borrador, su autoguardado y las operaciones — y las vistas se ocupan de
 * presentarla.
 *
 * Semántica preservada tal cual: UUID estable por operación, cola local
 * previa al primer intento de red, y el mismo endpoint de sincronización.
 */
export function useVisitDraft(initial: DaySnapshot, visitId: number) {
  const [snapshot, setSnapshot] = useState(initial);
  const visit = snapshot.visits.find((v) => v.id === visitId)!;
  const canMedical = ['admin', 'veterinario'].includes(snapshot.role);
  const ownRecords = visit.records.filter((r) => r.appointmentId === visit.id);
  const invoice = visit.invoices.find((i) => i.status !== 'anulada');
  const balance = invoice ? Math.max(0, Number(invoice.total) - invoice.paid) : 0;
  const closed = ['completada', 'cancelada', 'no_asistio'].includes(visit.status);

  const [draft, setDraft] = useState<VisitDraft>(() => emptyDraft(visit));
  const [ready, setReady] = useState(false);
  const [savedAt, setSavedAt] = useState<string>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<QueuedVisit>();
  const [photosBusy, setPhotosBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const identityValid = useFieldIdentity(initial.userId);
  const pendingStatus = pending && ['travel', 'start'].includes(pending.operation.action);
  const mounted = useRef(true);
  const hadPending = useRef<QueuedOperation | null>(null);

  const clinicalChanged = Boolean(
    draft.reason || draft.subjective || draft.diagnosis || draft.treatment || draft.observations ||
    draft.weight || draft.temperature || draft.heartRate || draft.respiratoryRate ||
    draft.photos.length || draft.supplies.length
  );
  // La adenda es la única escritura clínica posible sobre una visita
  // cerrada, y se cuenta aparte de la nota en curso.
  const amendmentReady = Boolean(closed && canMedical && draft.amendment.trim() && ownRecords.length);
  const dirty = clinicalChanged || amendmentReady || Boolean(draft.amount || draft.payment || draft.items.length || draft.noCharge !== (visit.noCharge ?? false));
  const context = `patientId=${visit.patientId}&appointmentId=${visit.id}&returnTo=${encodeURIComponent(`/citas/${visit.id}`)}${ownRecords[0] ? `&medicalRecordId=${ownRecords[0].id}` : ''}`;

  const update = <K extends keyof VisitDraft>(key: K, value: VisitDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  useEffect(() => {
    mounted.current = true;
    const network = () => setOnline(navigator.onLine);
    network(); window.addEventListener('online', network); window.addEventListener('offline', network);
    (async () => {
      const stored = await loadFieldDraft<Partial<VisitDraft>>(initial.userId, visitId);
      // Un borrador escrito por una versión anterior no trae los campos
      // nuevos: se completa con los vacíos en vez de rechazarlo, porque
      // contiene trabajo que nadie más tiene.
      if (stored && mounted.current) { setDraft({ ...emptyDraft(visit), ...stored }); setSavedAt('Borrador recuperado de este dispositivo'); }
      if (mounted.current) setReady(true);
    })().catch((e) => { setError(e.message); setReady(true); });

    const refreshPending = () => listPending(initial.userId).then(async (items) => {
      const item = items.filter((i) => i.operation.visitId === visitId).at(-1);
      if (!mounted.current) return;
      setPending(item);
      if (hadPending.current && !item) {
        const previous = hadPending.current;
        hadPending.current = null;
        const fresh = await refresh();
        if (!['travel', 'start'].includes(previous.action)) resetAfterConfirm(fresh);
      } else hadPending.current = item?.operation ?? null;
    }).catch((e) => setError(e.message));
    refreshPending(); window.addEventListener(FIELD_EVENT, refreshPending);
    return () => {
      mounted.current = false;
      window.removeEventListener(FIELD_EVENT, refreshPending);
      window.removeEventListener('online', network); window.removeEventListener('offline', network);
    };
  }, [initial.userId, visitId]);

  useEffect(() => {
    if (!ready || !dirty || (pending && !pendingStatus) || !identityValid) return;
    const timer = setTimeout(
      () => saveFieldDraft(initial.userId, visitId, draft)
        .then(() => setSavedAt(`Borrador guardado a las ${clinicTime(new Date())}`))
        .catch((e) => { setError(e.message); setSavedAt(undefined); }),
      800,
    );
    return () => clearTimeout(timer);
  }, [draft, ready, dirty, pending, identityValid, initial.userId, visitId]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty && !pending) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending]);

  function resetAfterConfirm(fresh: DaySnapshot | null | undefined) {
    const confirmed = fresh?.visits.find((v) => v.id === visitId);
    setDraft({ ...emptyDraft(visit), noCharge: confirmed?.noCharge ?? false });
    setSavedAt(undefined);
  }

  async function refresh() {
    if (navigator.onLine) {
      const response = await fetch(`/api/visits/${visitId}`);
      if (!response.ok) throw new Error('No se pudo actualizar la visita. Conserva esta pantalla y reintenta.');
      const data: DaySnapshot = await response.json();
      if (data.userId !== initial.userId) throw new Error('La cuenta activa cambió. Vuelve a iniciar sesión.');
      setSnapshot(data);
      return data;
    }
    const cached = await getDay(initial.userId);
    if (cached) setSnapshot(cached);
    return cached;
  }

  async function sync() {
    setBusy(true); setError('');
    const syncedAction = pending?.operation.action;
    try {
      const result = await syncPending(initial.userId);
      const remaining = (await listPending(initial.userId)).filter((q) => q.operation.visitId === visitId).at(-1);
      setPending(remaining);
      if (remaining) { setError(remaining.error || result.error || 'Guardado en el dispositivo, pendiente de sincronizar.'); return; }
      const fresh = await refresh();
      if (syncedAction && !['travel', 'start'].includes(syncedAction)) resetAfterConfirm(fresh);
      toast.success('Visita guardada y sincronizada');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo sincronizar'); }
    finally { setBusy(false); }
  }

  /** Construye la operación a partir del borrador; lanza con el motivo exacto. */
  function buildOperation(action: VisitOperation['action']): VisitOperation {
    const operation: VisitOperation = {
      id: crypto.randomUUID(), visitId, expectedUpdatedAt: visit.updatedAt, action,
      version: 2, occurredAt: new Date().toISOString(),
    };
    if (pendingStatus) operation.predecessorId = pending!.operation.id;
    if (!['save', 'complete'].includes(action)) return operation;

    // Visita cerrada: solo cabe la adenda, y el original queda intacto.
    if (amendmentReady) {
      const target = draft.amendsRecordId ?? ownRecords[0].id;
      operation.record = {
        reason: `Adenda: ${(visit.reason || 'atención a domicilio').slice(0, 200)}`,
        observations: draft.amendment.trim(),
        amendsRecordId: target,
      };
      return operation;
    }

    if (clinicalChanged && canMedical && !closed) {
      const signs: NonNullable<NonNullable<VisitOperation['record']>['vitalSigns']> = {};
      for (const key of ['weight', 'temperature', 'heartRate', 'respiratoryRate'] as const) {
        if (draft[key]) {
          const value = Number(draft[key]);
          if (!Number.isFinite(value) || value <= 0) throw new Error('Revisa los signos vitales: usa números mayores a cero.');
          signs[key] = value;
        }
      }
      operation.record = {
        reason: draft.reason.trim() || visit.reason || 'Atención a domicilio',
        subjective: draft.subjective, diagnosis: draft.diagnosis, treatment: draft.treatment,
        observations: draft.observations, vitalSigns: signs, supplies: draft.supplies, photos: draft.photos,
        templateId: draft.templateId ?? undefined, templateVersion: draft.templateVersion ?? undefined,
      };
    }
    // Las prestaciones del catálogo las valora el servidor con el precio
    // vigente: el cliente solo declara qué se realizó y en qué cantidad.
    const performed = draft.items.filter((item) => item.performed && item.quantity > 0);
    if (!invoice && performed.length) operation.items = performed.map(({ serviceId, quantity }) => ({ serviceId, quantity }));
    if (!invoice && !performed.length && draft.amount) {
      if (Number(draft.amount) <= 0) throw new Error('Ingresa un monto de cobro válido');
      operation.charge = { description: draft.description, amount: Number(draft.amount) };
    }
    if (draft.payment) {
      if (Number(draft.payment) <= 0) throw new Error('Ingresa un pago válido');
      operation.payment = { amount: Number(draft.payment), method: draft.method };
    }
    operation.noCharge = draft.noCharge;

    if (action === 'save' && !operation.record && !operation.charge && !operation.items && !operation.payment) {
      throw new Error('Completa la consulta o registra un cobro antes de guardar.');
    }
    if (action === 'complete' && !ownRecords.length && !operation.record) throw new Error('Registra la consulta antes de cerrar la visita.');
    if (action === 'complete' && !invoice && !operation.charge && !operation.items && !operation.noCharge) {
      throw new Error('Añade el cobro o marca atención sin costo.');
    }
    return operation;
  }

  async function submit(action: VisitOperation['action']) {
    if (busy || (pending && !pendingStatus) || !identityValid) return;
    setBusy(true); setError('');
    try {
      if (action === 'save' && !navigator.onLine) {
        await saveFieldDraft(initial.userId, visitId, draft);
        setSavedAt('Borrador guardado en este dispositivo');
        toast.success('Borrador guardado. Puedes seguir editando y cerrar la visita al terminar.');
        return;
      }
      const operation = buildOperation(action);
      await saveFieldDraft(initial.userId, visitId, draft);
      await queueVisit(initial.userId, operation, visit.patient.name);
      setPending({ userId: initial.userId, operation, createdAt: new Date().toISOString() });
      const result = await syncPending(initial.userId);
      const remaining = (await listPending(initial.userId)).filter((q) => q.operation.visitId === visitId).at(-1);
      setPending(remaining);
      if (remaining) {
        setError(remaining.error || result.error || 'Guardado en el dispositivo. Se enviará al recuperar conexión.');
      } else {
        const fresh = await refresh();
        resetAfterConfirm(fresh);
        toast.success(action === 'complete' ? 'Visita cerrada' : 'Cambios guardados');
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar. Tu borrador se conserva.'); }
    finally { setBusy(false); }
  }

  async function correctPending() {
    if (!pending?.blocked || !navigator.onLine) return;
    setBusy(true);
    try {
      await refresh(); hadPending.current = null;
      const rejected = (await listPending(initial.userId)).filter((q) => q.operation.visitId === visitId && q.blocked);
      // Solo se descartan los rechazos confirmados por el servidor. Una
      // operación de resultado incierto no se toca aquí: podría haberse
      // aplicado y borrarla invitaría a crear un duplicado.
      for (const item of rejected.filter((i) => i.outcome !== 'incierto')) await removePending(initial.userId, item.operation.id);
      setPending(undefined);
      setError('Versión actual cargada. Revisa el borrador y vuelve a guardar; los intentos rechazados no se aplicaron.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar la visita'); }
    finally { setBusy(false); }
  }

  async function saveDraftNow() {
    if (dirty && (!pending || pendingStatus)) await saveFieldDraft(initial.userId, visitId, draft);
  }

  return {
    snapshot, visit, draft, setDraft, update,
    canMedical, ownRecords, invoice, balance, closed, context,
    ready, savedAt, error, setError, busy, setBusy, photosBusy, setPhotosBusy,
    pending, pendingStatus, online, identityValid, clinicalChanged, amendmentReady, dirty,
    submit, sync, correctPending, refresh, saveDraftNow,
  };
}

export type VisitDraftController = ReturnType<typeof useVisitDraft>;
