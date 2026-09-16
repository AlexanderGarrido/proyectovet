import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { DaySnapshot, VisitOperation, VisitSnapshot } from '../../lib/visit-types';
import { FIELD_EVENT, getDay, listPending, loadFieldDraft, queueVisit, removePending, saveFieldDraft, syncPending, type QueuedVisit } from '../../lib/field-storage';
import { useFieldIdentity } from './useFieldIdentity';
import { clinicTime, CLINIC_TIME_ZONE } from '../../lib/clinic-time';
import { compressImage } from '../../lib/image';
import { googleMapsUrl, wazeUrl } from '../../lib/maps';
import { buildWhatsappLink } from '../../lib/whatsapp';
import { VisitSummary } from './VisitSummary';

interface Draft {
  reason: string; subjective: string; diagnosis: string; treatment: string; observations: string;
  weight: string; temperature: string; heartRate: string; respiratoryRate: string;
  supplies: { productId: number; quantity: number; locationId: number | null }[]; photos: string[];
  amount: string; description: string; payment: string; method: 'efectivo' | 'transferencia' | 'tarjeta' | 'otro'; noCharge: boolean;
}
const field = 'w-full rounded-lg border bg-background px-3 py-2.5 text-sm';
const button = 'inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50';
const money = (n: number) => `$${n.toLocaleString('es-CL')}`;

export function VisitWorkspace({ initial, visitId, onBack }: { initial: DaySnapshot; visitId: number; onBack?: () => void }) {
  const [snapshot, setSnapshot] = useState(initial);
  const visit = snapshot.visits.find((v) => v.id === visitId)!;
  const canMedical = ['admin', 'veterinario'].includes(snapshot.role);
  const ownRecords = visit.records.filter((r) => r.appointmentId === visit.id);
  const invoice = visit.invoices.find((i) => i.status !== 'anulada');
  const balance = invoice ? Math.max(0, Number(invoice.total) - invoice.paid) : 0;
  const closed = ['completada', 'cancelada', 'no_asistio'].includes(visit.status);
  const initialDraft: Draft = { reason: '', subjective: '', diagnosis: '', treatment: '', observations: '', weight: '', temperature: '', heartRate: '', respiratoryRate: '', supplies: [], photos: [], amount: '', description: visit.reason || 'Atención veterinaria a domicilio', payment: '', method: 'efectivo', noCharge: visit.noCharge ?? false };
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [ready, setReady] = useState(false);
  const [savedAt, setSavedAt] = useState<string>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<QueuedVisit>();
  const [section, setSection] = useState('atencion');
  const [photosBusy, setPhotosBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const identityValid = useFieldIdentity(initial.userId);
  const pendingStatus = pending && ['travel', 'start'].includes(pending.operation.action);
  const mounted = useRef(true);
  const hadPending = useRef<VisitOperation | null>(null);
  const clinicalChanged = Boolean(draft.reason || draft.subjective || draft.diagnosis || draft.treatment || draft.observations || draft.weight || draft.temperature || draft.heartRate || draft.respiratoryRate || draft.photos.length || draft.supplies.length);
  const dirty = clinicalChanged || Boolean(draft.amount || draft.payment || draft.noCharge !== (visit.noCharge ?? false));
  const context = `patientId=${visit.patientId}&appointmentId=${visit.id}&returnTo=${encodeURIComponent(`/citas/${visit.id}`)}${ownRecords[0] ? `&medicalRecordId=${ownRecords[0].id}` : ''}`;

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  useEffect(() => {
    mounted.current = true;
    const network = () => setOnline(navigator.onLine);
    network(); window.addEventListener('online', network); window.addEventListener('offline', network);
    (async () => {
      const stored = await loadFieldDraft<Draft>(initial.userId, visitId);
      if (stored && mounted.current) { setDraft(stored); setSavedAt('Borrador recuperado de este dispositivo'); }
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
        if (!['travel', 'start'].includes(previous.action)) { setDraft({ ...initialDraft, noCharge: fresh?.visits.find((v) => v.id === visitId)?.noCharge ?? false }); setSavedAt(undefined); }
      } else hadPending.current = item?.operation ?? null;
    }).catch((e) => setError(e.message));
    refreshPending(); window.addEventListener(FIELD_EVENT, refreshPending);
    return () => { mounted.current = false; window.removeEventListener(FIELD_EVENT, refreshPending); window.removeEventListener('online', network); window.removeEventListener('offline', network); };
  }, [initial.userId, visitId]);
  useEffect(() => {
    if (!ready || !dirty || (pending && !pendingStatus) || !identityValid) return;
    const timer = setTimeout(() => saveFieldDraft(initial.userId, visitId, draft).then(() => setSavedAt(`Borrador guardado a las ${clinicTime(new Date())}`)).catch((e) => { setError(e.message); setSavedAt(undefined); }), 800);
    return () => clearTimeout(timer);
  }, [draft, ready, dirty, pending, identityValid, initial.userId, visitId]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty && !pending) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending]);

  async function refresh() {
    if (navigator.onLine) {
      const response = await fetch(`/api/visits/${visitId}`);
      if (!response.ok) throw new Error('No se pudo actualizar la visita. Conserva esta pantalla y reintenta.');
      const data: DaySnapshot = await response.json();
      if (data.userId !== initial.userId) throw new Error('La cuenta activa cambió. Vuelve a iniciar sesión.');
      setSnapshot(data);
      return data;
    } else { const cached = await getDay(initial.userId); if (cached) setSnapshot(cached); return cached; }
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
      if (syncedAction && !['travel', 'start'].includes(syncedAction)) { setDraft({ ...initialDraft, noCharge: fresh?.visits.find((v) => v.id === visitId)?.noCharge ?? false }); setSavedAt(undefined); }
      toast.success('Visita guardada y sincronizada');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo sincronizar'); }
    finally { setBusy(false); }
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
      const operation: VisitOperation = { id: crypto.randomUUID(), visitId, expectedUpdatedAt: visit.updatedAt, action };
      if (pendingStatus) operation.predecessorId = pending!.operation.id;
      if (['save', 'complete'].includes(action)) {
        if (clinicalChanged && canMedical && !closed) {
          const signs: NonNullable<NonNullable<VisitOperation['record']>['vitalSigns']> = {};
          for (const key of ['weight', 'temperature', 'heartRate', 'respiratoryRate'] as const) {
            if (draft[key]) { const value = Number(draft[key]); if (!Number.isFinite(value) || value <= 0) throw new Error('Revisa los signos vitales: usa números mayores a cero.'); signs[key] = value; }
          }
          operation.record = { reason: draft.reason.trim() || visit.reason || 'Atención a domicilio', subjective: draft.subjective, diagnosis: draft.diagnosis, treatment: draft.treatment, observations: draft.observations, vitalSigns: signs, supplies: draft.supplies, photos: draft.photos };
        }
        if (!invoice && draft.amount) { if (Number(draft.amount) <= 0) throw new Error('Ingresa un monto de cobro válido'); operation.charge = { description: draft.description, amount: Number(draft.amount) }; }
        if (draft.payment) { if (Number(draft.payment) <= 0) throw new Error('Ingresa un pago válido'); operation.payment = { amount: Number(draft.payment), method: draft.method }; }
        operation.noCharge = draft.noCharge;
        if (action === 'save' && !operation.record && !operation.charge && !operation.payment) throw new Error('Completa la consulta o registra un cobro antes de guardar.');
        if (action === 'complete' && !ownRecords.length && !operation.record) throw new Error('Registra la consulta antes de cerrar la visita.');
        if (action === 'complete' && !invoice && !operation.charge && !operation.noCharge) throw new Error('Añade el cobro o marca atención sin costo.');
      }
      await saveFieldDraft(initial.userId, visitId, draft);
      await queueVisit(initial.userId, operation);
      setPending({ userId: initial.userId, operation, createdAt: new Date().toISOString() });
      const result = await syncPending(initial.userId);
      const remaining = (await listPending(initial.userId)).filter((q) => q.operation.visitId === visitId).at(-1);
      setPending(remaining);
      if (remaining) { setError(remaining.error || result.error || 'Guardado en el dispositivo. Se enviará al recuperar conexión.'); }
      else { const fresh = await refresh(); setDraft({ ...initialDraft, noCharge: fresh?.visits.find((v) => v.id === visitId)?.noCharge ?? false }); setSavedAt(undefined); toast.success(action === 'complete' ? 'Visita cerrada' : 'Cambios guardados'); }
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar. Tu borrador se conserva.'); }
    finally { setBusy(false); }
  }
  async function correctPending() {
    if (!pending?.blocked || !navigator.onLine) return;
    setBusy(true);
    try {
      await refresh(); hadPending.current = null;
      const rejected = (await listPending(initial.userId)).filter((q) => q.operation.visitId === visitId && q.blocked);
      for (const item of rejected) await removePending(initial.userId, item.operation.id);
      setPending(undefined); setError('Versión actual cargada. Revisa el borrador y vuelve a guardar; los intentos rechazados no se aplicaron.');
    }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar la visita'); }
    finally { setBusy(false); }
  }
  async function addPhotos(files: FileList | null) {
    if (!files) return;
    if (draft.photos.length + files.length > 6) { setError('Máximo seis fotos por consulta'); return; }
    setPhotosBusy(true);
    try { const images = await Promise.all(Array.from(files).map((file) => compressImage(file))); update('photos', [...draft.photos, ...images]); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron preparar las fotos'); }
    finally { setPhotosBusy(false); }
  }
  async function back() {
    try {
      if (dirty && (!pending || pendingStatus)) await saveFieldDraft(initial.userId, visitId, draft);
      onBack?.();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el borrador. Conserva esta pantalla.'); }
  }

  const address = visit.visitAddress || visit.owner.address;
  const provisionalRecord = pending?.operation.record || (clinicalChanged ? {
    reason: draft.reason || visit.reason || 'Atención a domicilio', subjective: draft.subjective,
    diagnosis: draft.diagnosis, treatment: draft.treatment, observations: draft.observations,
  } : null);
  const summaryVisit: VisitSnapshot = provisionalRecord ? { ...visit, records: [...visit.records, {
    id: -1, appointmentId: visit.id, patientId: visit.patientId, date: pending?.createdAt || new Date().toISOString(),
    reason: provisionalRecord.reason, subjective: provisionalRecord.subjective || null, diagnosis: provisionalRecord.diagnosis || null,
    treatment: provisionalRecord.treatment || null, observations: provisionalRecord.observations || null, vitalSigns: null,
  }] } : visit;
  if (!identityValid) return <p role="alert">La sesión cambió. <a href="/dashboard" className="text-primary underline">Abre tu jornada actual</a>.</p>;
  return <div className="mx-auto max-w-5xl space-y-5 pb-24">
    <div className="flex items-center justify-between gap-3 print:hidden">
      {onBack ? <button className="text-sm text-primary" onClick={back}>← Mi jornada</button> : <a className="text-sm text-primary" href="/dashboard">← Mi jornada</a>}
      <a className="text-sm text-primary" href={`/citas/${visitId}/editar`}>Editar agenda</a>
    </div>
    <section className="rounded-2xl bg-primary p-5 text-primary-foreground print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm opacity-80">{clinicTime(visit.scheduledAt)} · {visit.type} · {visit.status.replaceAll('_', ' ')}</p><h2 className="mt-1 text-2xl font-semibold">{visit.patient.name}</h2><p className="mt-1 text-sm opacity-90">{visit.patient.species} {visit.patient.breed && `· ${visit.patient.breed}`} · {visit.owner.firstName} {visit.owner.lastName}</p></div><a className="rounded-lg border border-white/40 px-3 py-2 text-sm" href={`/pacientes/${visit.patientId}`}>Ficha del paciente</a></div>
      <p className="mt-4 text-sm">{address || 'Dirección pendiente de completar'}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {address && <><a className={`${button} bg-background text-foreground`} target="_blank" rel="noreferrer" href={googleMapsUrl(address)}>Abrir Maps ↗</a><a className={button} target="_blank" rel="noreferrer" href={wazeUrl(address)}>Waze ↗</a></>}
        {visit.owner.phone && <><a className={button} href={`tel:${visit.owner.phone}`}>Llamar</a><a className={button} target="_blank" rel="noreferrer" href={buildWhatsappLink(visit.owner.phone, `Hola ${visit.owner.firstName}, soy de Alma Veterinaria. Te escribo por la visita de ${visit.patient.name}.`) || '#'}>WhatsApp ↗</a></>}
      </div>
    </section>
    {error && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 print:hidden">{error}</div>}
    {pending && <section className="rounded-xl border bg-card p-4 print:hidden"><h3 className="font-semibold">{pending.blocked ? 'El guardado necesita revisión' : 'Cambios pendientes en este dispositivo'}</h3><p className="mt-1 text-sm text-muted-foreground">{pending.error || 'Conservamos la consulta para enviarla sin duplicar insumos ni cobros.'}</p><div className="mt-3 flex flex-wrap gap-2"><button className={button} disabled={busy || pending.blocked} onClick={sync}>Sincronizar ahora</button>{pending.blocked && <button className={button} disabled={busy} onClick={correctPending}>Revisar versión actual y corregir</button>}</div></section>}
    <nav aria-label="Pasos de la visita" className="flex gap-2 overflow-x-auto print:hidden">{[['atencion', 'Atención'], ['antecedentes', 'Antecedentes'], ['cierre', 'Cobro y cierre'], ['resumen', 'Resumen']].map(([id, label]) => <button key={id} onClick={() => setSection(id)} aria-current={section === id ? 'step' : undefined} className={`${button} shrink-0 ${section === id ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>{label}</button>)}</nav>
    {section === 'antecedentes' && <section className="space-y-4 rounded-xl border bg-card p-5"><h3 className="text-lg font-semibold">Antecedentes de {visit.patient.name}</h3><p className="text-sm">Peso en ficha: {visit.patient.weight ? `${visit.patient.weight} kg` : 'Sin registro'}</p>{visit.patient.notes && <p className="whitespace-pre-wrap text-sm">{visit.patient.notes}</p>}{visit.records.length ? visit.records.map((record) => <article className="rounded-lg border p-3" key={record.id}><p className="text-sm font-semibold">{record.reason} · {new Date(record.date).toLocaleDateString('es-CL', { timeZone: CLINIC_TIME_ZONE })}</p><p className="mt-1 whitespace-pre-wrap text-sm">{record.diagnosis || 'Sin diagnóstico registrado'}</p><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{record.treatment}</p></article>) : <p className="text-sm text-muted-foreground">{canMedical ? 'Sin consultas previas en esta copia.' : 'Los antecedentes clínicos están disponibles para el veterinario.'}</p>}<h4 className="font-semibold">Vacunas</h4>{visit.vaccines.map((v, i) => <p className="text-sm" key={i}>{v.name} · {v.applicationDate} {v.nextDoseDate && `· Próxima: ${v.nextDoseDate}`}</p>)}</section>}
    {section === 'atencion' && <section className="space-y-5 rounded-xl border bg-card p-5 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">Atención de la visita</h3>{!closed && <div className="flex gap-2"><button className={button} disabled={busy || !!pending || visit.status === 'en_curso' || visit.status === 'en_camino' || dirty} onClick={() => submit('travel')}>En camino</button><button className={`${button} bg-primary text-primary-foreground`} disabled={busy || !!pending || visit.status === 'en_curso' || dirty} onClick={() => submit('start')}>Iniciar atención</button></div>}</div>
      {ownRecords.length > 0 && <p className="rounded-lg bg-muted p-3 text-sm">{ownRecords.length} registro(s) guardado(s) en esta visita. {closed ? 'Puedes consultar el resumen y registrar pagos pendientes.' : 'Puedes agregar una nota adicional o continuar al cobro.'}</p>}
      {!canMedical || closed ? <p className="text-sm text-muted-foreground">{closed ? 'La atención está cerrada.' : 'La nota clínica debe ser completada por el veterinario.'}</p> : <fieldset disabled={busy || (!!pending && !pendingStatus)} className="space-y-4">
        <label className="block text-sm font-medium">Motivo de consulta<input className={`${field} mt-1`} maxLength={255} value={draft.reason} placeholder={visit.reason || 'Motivo de atención'} onChange={(e) => update('reason', e.target.value)} /></label>
        {(['subjective', 'diagnosis', 'treatment', 'observations'] as const).map((key) => <label className="block text-sm font-medium" key={key}>{{ subjective: 'Lo que reporta el responsable', diagnosis: 'Evaluación y diagnóstico', treatment: 'Tratamiento e indicaciones', observations: 'Observaciones adicionales' }[key]}<textarea className={`${field} mt-1`} rows={3} maxLength={2000} value={draft[key]} onChange={(e) => update(key, e.target.value)} /></label>)}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{(['weight', 'temperature', 'heartRate', 'respiratoryRate'] as const).map((key) => <label className="text-sm" key={key}>{{ weight: 'Peso (kg)', temperature: 'Temperatura (°C)', heartRate: 'FC (lpm)', respiratoryRate: 'FR (rpm)' }[key]}<input className={`${field} mt-1`} type="number" min="0.01" step={key === 'heartRate' || key === 'respiratoryRate' ? '1' : '0.01'} value={draft[key]} onChange={(e) => update(key, e.target.value)} /></label>)}</div>
        <div><div className="flex items-center justify-between"><h4 className="font-medium">Insumos utilizados</h4><button type="button" className="text-sm text-primary" onClick={() => update('supplies', [...draft.supplies, { productId: snapshot.products[0]?.id || 0, quantity: 1, locationId: snapshot.locations[0]?.id ?? null }])}>+ Agregar</button></div><p className="mt-1 text-xs text-muted-foreground">El stock se descuenta cuando el servidor confirma el guardado.</p>{draft.supplies.map((s, i) => <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border p-3" key={i}><select aria-label="Insumo" className={field} value={s.productId} onChange={(e) => update('supplies', draft.supplies.map((x, j) => j === i ? { ...x, productId: Number(e.target.value) } : x))}>{snapshot.products.map((p) => <option value={p.id} key={p.id}>{p.name} · {s.locationId ? snapshot.locations.find((l) => l.id === s.locationId)?.stocks.find((stock) => stock.productId === p.id)?.stock || '0' : p.stock} {p.unit}</option>)}</select><input aria-label="Cantidad utilizada" className={field} type="number" min="0.001" step="0.001" value={s.quantity} onChange={(e) => update('supplies', draft.supplies.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} /><select aria-label="Botiquín" className={field} value={s.locationId ?? ''} onChange={(e) => update('supplies', draft.supplies.map((x, j) => j === i ? { ...x, locationId: Number(e.target.value) || null } : x))}><option value="">Stock sin asignar</option>{snapshot.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select><button type="button" className="text-sm text-red-600" onClick={() => update('supplies', draft.supplies.filter((_, j) => j !== i))}>Quitar</button></div>)}</div>
        <label className="block text-sm font-medium">Fotos clínicas (máximo 6)<input className="mt-2 block w-full text-sm" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple disabled={photosBusy} onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} /></label><div className="grid grid-cols-3 gap-2">{draft.photos.map((photo, i) => <div key={i}><img className="aspect-square w-full rounded-lg object-cover" src={photo} alt={`Foto clínica ${i + 1}`} /><button type="button" className="mt-1 text-sm text-red-600" onClick={() => update('photos', draft.photos.filter((_, j) => j !== i))}>Quitar foto {i + 1}</button></div>)}</div>
      </fieldset>}
      <div className="flex flex-wrap gap-2 border-t pt-4">{canMedical && <><a className={button} href={`/recetas/nueva?${context}`}>Crear receta</a><a className={button} href={`/ordenes/nueva?${context}`}>Orden de laboratorio</a><a className={button} href={`/consentimientos/nueva?${context}`}>Consentimiento</a></>}</div>
    </section>}
    {section === 'cierre' && <section className="space-y-5 rounded-xl border bg-card p-5 print:hidden"><h3 className="text-lg font-semibold">Cobro y cierre</h3><fieldset disabled={busy || (!!pending && !pendingStatus)} className="space-y-4">{invoice ? <div className="rounded-lg bg-muted p-4"><p>Total: {money(Number(invoice.total))} · Recibido: {money(invoice.paid)}</p><p className="mt-1 text-lg font-semibold">Saldo: {money(balance)}</p><a className="text-sm text-primary" href={`/facturacion/${invoice.id}`}>Ver detalle del cobro</a></div> : <><label className="block text-sm">Descripción del servicio<input className={`${field} mt-1`} maxLength={255} value={draft.description} disabled={draft.noCharge} onChange={(e) => update('description', e.target.value)} /></label><label className="block text-sm">Total a cobrar (CLP)<input className={`${field} mt-1`} type="number" min="1" step="1" value={draft.amount} disabled={draft.noCharge} onChange={(e) => update('amount', e.target.value)} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.noCharge} onChange={(e) => { update('noCharge', e.target.checked); if (e.target.checked) setDraft((d) => ({ ...d, amount: '', payment: '' })); }} /> Atención sin costo</label></>}{!draft.noCharge && (!invoice || balance > 0) && <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Monto recibido ahora (opcional)<input className={`${field} mt-1`} type="number" min="1" step="1" value={draft.payment} onChange={(e) => update('payment', e.target.value)} /></label><label className="text-sm">Medio de pago<select className={`${field} mt-1`} value={draft.method} onChange={(e) => update('method', e.target.value as Draft['method'])}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia recibida</option><option value="tarjeta">Tarjeta cobrada</option><option value="otro">Otro</option></select></label></div>}<p className="text-xs text-muted-foreground">Registra únicamente pagos ya recibidos. Si estás sin señal, el registro quedará pendiente de confirmación; los enlaces de pago necesitan conexión.</p></fieldset><div className="space-y-2 border-t pt-4"><p className="text-sm">Consulta: {ownRecords.length ? 'guardada' : clinicalChanged ? 'lista para guardar' : 'pendiente'}</p><p className="text-sm">Cobro: {invoice ? balance > 0 ? 'saldo pendiente' : 'pagado' : draft.noCharge ? 'sin costo' : draft.amount ? 'listo para registrar' : 'pendiente'}</p></div><a className={button} href={`/citas/nueva?${context}&followup=1`}>Programar control</a></section>}
    {section === 'resumen' && <VisitSummary visit={summaryVisit} provisional={Boolean(provisionalRecord)} />}
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-lg print:hidden"><p className="text-xs text-muted-foreground" role="status">{pending ? 'Pendiente de sincronizar' : savedAt || 'Los cambios se guardan como borrador en este dispositivo'}</p><div className="flex flex-wrap gap-2"><button className={button} disabled={busy || photosBusy || (!!pending && !pendingStatus) || !ready} onClick={() => submit('save')}>{busy ? 'Guardando…' : online ? 'Guardar cambios' : 'Guardar borrador'}</button>{canMedical && !closed && <button className={`${button} bg-primary text-primary-foreground`} disabled={busy || photosBusy || (!!pending && !pendingStatus) || !ready} onClick={() => { if (section !== 'cierre') setSection('cierre'); else submit('complete'); }}>{section === 'cierre' ? 'Guardar y cerrar visita' : 'Continuar al cierre'}</button>}</div></div>
  </div>;
}
