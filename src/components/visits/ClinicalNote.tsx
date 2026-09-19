import { useEffect, useState } from 'react';
import type { VisitDraftController } from './useVisitDraft';
import type { TemplateShape } from '../../lib/clinical-templates';
import { BUILT_IN_TEMPLATES } from '../../lib/clinical-templates';
import type { TemplateSection } from '../../db/schema/clinical';
import { SuppliesEditor } from './SuppliesEditor';
import { compressImage } from '../../lib/image';
import { features } from '../../lib/features';

const field = 'w-full rounded-lg border bg-background px-3 py-2.5 text-base sm:text-sm';
const button = 'inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50';

const DEFAULT_LABELS: Record<TemplateSection['field'], string> = {
  reason: 'Motivo de consulta',
  subjective: 'Lo que reporta el responsable',
  diagnosis: 'Evaluación y diagnóstico',
  treatment: 'Tratamiento e indicaciones',
  observations: 'Observaciones adicionales',
};

const FALLBACK_SECTIONS: TemplateSection[] = (Object.keys(DEFAULT_LABELS) as TemplateSection['field'][])
  .map((f) => ({ field: f, label: DEFAULT_LABELS[f] }));

/**
 * Nota clínica de la visita. La plantilla aporta qué campos corresponden a
 * este tipo de atención y frases para insertar; no escribe hallazgos. Un
 * campo vacío se guarda vacío: «no registrado» no es «normal».
 */
export function ClinicalNote({ controller }: { controller: VisitDraftController }) {
  const { draft, update, visit, canMedical, closed, busy, pending, pendingStatus, ownRecords, snapshot, setError, photosBusy, setPhotosBusy } = controller;
  const { templates, source } = useTemplates(visit.type);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const selected = templates.find((t) => (t.id ?? 0) === (draft.templateId ?? 0)) ?? templates[0];
  const sections = selected?.sections.length ? selected.sections : FALLBACK_SECTIONS;
  const disabled = busy || (!!pending && !pendingStatus);

  // Elegir plantilla solo cambia la estructura visible y las frases
  // disponibles; nunca toca lo ya escrito en el borrador.
  function chooseTemplate(id: string) {
    const template = templates.find((t) => String(t.id ?? 0) === id);
    update('templateId', template?.id ?? null);
    update('templateVersion', template?.version ?? null);
  }

  function insertPhrase(target: TemplateSection['field'], phrase: string) {
    if (target === 'reason') { update('reason', `${draft.reason}${draft.reason ? ' ' : ''}${phrase}`.slice(0, 255)); return; }
    const current = draft[target];
    update(target, `${current}${current ? '\n' : ''}${phrase}`.slice(0, 2000));
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    if (draft.photos.length + files.length > 6) { setError('Máximo seis fotos por consulta'); return; }
    setPhotosBusy(true);
    try {
      const images = await Promise.all(Array.from(files).map((file) => compressImage(file)));
      update('photos', [...draft.photos, ...images]);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron preparar las fotos'); }
    finally { setPhotosBusy(false); }
  }

  if (!canMedical) {
    return <p className="text-sm text-muted-foreground">La nota clínica debe ser completada por el veterinario.</p>;
  }

  // Visita cerrada: la nota original no se toca. Lo único que se puede
  // escribir es una adenda, que queda como registro propio apuntando al
  // anterior, con su autor y su fecha.
  if (closed) {
    if (!ownRecords.length) {
      return <p className="text-sm text-muted-foreground">La atención está cerrada y no tiene una nota que corregir.</p>;
    }
    return (
      <fieldset disabled={disabled} className="space-y-3">
        <div>
          <h4 className="font-medium">Adenda a la nota de esta visita</h4>
          <p className="mt-0.5 text-sm text-muted-foreground">
            La atención está cerrada. Lo que escribas aquí se guarda como un registro nuevo que corrige al anterior, con tu nombre y la fecha de hoy; la nota original se conserva tal como quedó.
          </p>
        </div>
        {ownRecords.length > 1 && (
          <label className="block text-sm font-medium">
            Registro que corrige
            <select
              className={`${field} mt-1`}
              value={String(draft.amendsRecordId ?? ownRecords[0].id)}
              onChange={(e) => update('amendsRecordId', Number(e.target.value))}
            >
              {ownRecords.map((record) => (
                <option key={record.id} value={record.id}>{record.reason}</option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-sm font-medium">
          Corrección o aclaración
          <textarea
            className={`${field} mt-1`} rows={4} maxLength={2000}
            value={draft.amendment} onChange={(e) => update('amendment', e.target.value)}
            placeholder="Qué se corrige y por qué"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Una adenda no descuenta insumos ni modifica el cobro. Si hay que ajustar stock o dinero, se registra su propio movimiento.
        </p>
      </fieldset>
    );
  }

  return (
    <fieldset disabled={disabled} className="space-y-4">
      {ownRecords.length > 0 && (
        <p className="rounded-lg bg-muted p-3 text-sm">
          {ownRecords.length} registro(s) guardado(s) en esta visita. Puedes agregar una nota adicional o continuar al cobro.
        </p>
      )}

      <label className="block text-sm font-medium">
        Plantilla de atención
        <select className={`${field} mt-1`} value={String(draft.templateId ?? 0)} onChange={(e) => chooseTemplate(e.target.value)}>
          {templates.map((t) => <option key={t.id ?? `builtin-${t.visitType}`} value={String(t.id ?? 0)}>{t.name}{t.builtIn ? ' (incorporada)' : ''}</option>)}
        </select>
      </label>
      {source === 'error' && <p className="text-xs text-muted-foreground">No se pudieron cargar las plantillas de la clínica; se muestran las incorporadas.</p>}
      <p className="text-xs text-muted-foreground">
        La plantilla ordena los campos y ofrece frases. No completa hallazgos: lo que no escribas queda como no registrado.
      </p>

      {sections.map((section) => {
        const open = expanded[section.field] ?? !section.collapsed;
        const label = section.label || DEFAULT_LABELS[section.field];
        return (
          <div key={section.field}>
            {section.collapsed ? (
              <button type="button" className="text-sm font-medium text-primary" onClick={() => setExpanded((e) => ({ ...e, [section.field]: !open }))}>
                {open ? '− ' : '+ '}{label}
              </button>
            ) : (
              <label className="block text-sm font-medium" htmlFor={`campo-${section.field}`}>{label}</label>
            )}
            {section.hint && open && <p className="mt-0.5 text-xs text-muted-foreground">{section.hint}</p>}
            {open && (section.field === 'reason' ? (
              <input
                id={`campo-${section.field}`} className={`${field} mt-1`} maxLength={255}
                value={draft.reason} placeholder={visit.reason || 'Motivo de atención'}
                onChange={(e) => update('reason', e.target.value)}
              />
            ) : (
              <textarea
                id={`campo-${section.field}`} className={`${field} mt-1`} rows={3} maxLength={2000}
                value={draft[section.field]} onChange={(e) => update(section.field, e.target.value)}
              />
            ))}
            {open && selected?.phrases?.length ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {selected.phrases.map((phrase) => (
                  <button
                    key={phrase} type="button"
                    className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
                    onClick={() => insertPhrase(section.field, phrase)}
                  >
                    + {phrase.length > 40 ? `${phrase.slice(0, 40)}…` : phrase}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['weight', 'temperature', 'heartRate', 'respiratoryRate'] as const).map((key) => (
          <label className="text-sm" key={key}>
            {{ weight: 'Peso (kg)', temperature: 'Temperatura (°C)', heartRate: 'FC (lpm)', respiratoryRate: 'FR (rpm)' }[key]}
            <input
              className={`${field} mt-1`} type="number" min="0.01"
              step={key === 'heartRate' || key === 'respiratoryRate' ? '1' : '0.01'}
              value={draft[key]} onChange={(e) => update(key, e.target.value)}
            />
          </label>
        ))}
      </div>

      <SuppliesEditor controller={controller} products={snapshot.products} locations={snapshot.locations} />

      <div>
        <label className="block text-sm font-medium">
          Fotos clínicas (máximo 6)
          <input
            className="mt-2 block w-full text-sm" type="file" accept="image/jpeg,image/png,image/webp"
            capture="environment" multiple disabled={photosBusy}
            onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }}
          />
        </label>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {draft.photos.map((photo, i) => (
            <div key={i}>
              <img className="aspect-square w-full rounded-lg object-cover" src={photo} alt={`Foto clínica ${i + 1}`} />
              <button type="button" className={`${button} mt-1 w-full border-0 text-destructive`} onClick={() => update('photos', draft.photos.filter((_, j) => j !== i))}>
                Quitar foto {i + 1}
              </button>
            </div>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

/**
 * Plantillas para este tipo de visita. Sin señal —o si el endpoint
 * falla— se usan las incorporadas, que viven en el bundle: quedarse sin
 * estructura por un fallo de red sería peor que ofrecer la mínima.
 */
function useTemplates(visitType: string) {
  const [templates, setTemplates] = useState<TemplateShape[]>(() => BUILT_IN_TEMPLATES.filter((t) => t.visitType === visitType));
  const [source, setSource] = useState<'incorporadas' | 'clinica' | 'error'>('incorporadas');

  useEffect(() => {
    let active = true;
    const fallback = () => BUILT_IN_TEMPLATES.filter((t) => t.visitType === visitType).concat(BUILT_IN_TEMPLATES.filter((t) => t.visitType !== visitType));
    if (!features.plantillas || !navigator.onLine) { setTemplates(fallback()); return; }
    fetch('/api/clinical-templates')
      .then((r) => { if (!r.ok) throw new Error('plantillas'); return r.json(); })
      .then((all: TemplateShape[]) => {
        if (!active) return;
        const forType = all.filter((t) => t.visitType === visitType);
        setTemplates(forType.length ? forType : fallback());
        setSource('clinica');
      })
      .catch(() => { if (active) { setTemplates(fallback()); setSource('error'); } });
    return () => { active = false; };
  }, [visitType]);

  return { templates, source };
}
