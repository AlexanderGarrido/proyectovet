import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, Trash2, Camera, X, CloudCheck } from 'lucide-react';
import { medicalRecordFormSchema, type MedicalRecordFormData } from '../../lib/schemas';
import { formatQty } from '../../lib/utils';
import { compressImage } from '../../lib/image';
import { saveDraft, loadDraft, deleteDraft } from '../../lib/offlineDraft';

interface Patient { id: number; name: string; ownerFirstName?: string; ownerLastName?: string; }
interface Product { id: number; name: string; unit: string; stock: string; }
interface SupplyRow { productId: string; quantity: string; }
interface StockLocation { id: number; name: string; type: 'central' | 'vehiculo'; }

export function MedicalRecordForm({ patientId, appointmentId }: { patientId?: number; appointmentId?: number }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [locationId, setLocationId] = useState('');
  const [supplies, setSupplies] = useState<SupplyRow[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const draftKey = `medical-record:${patientId ?? 'new'}:${appointmentId ?? 'none'}`;
  const restoredRef = useRef(false);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<MedicalRecordFormData>({
    resolver: zodResolver(medicalRecordFormSchema),
    defaultValues: { patientId: patientId?.toString() || '' },
  });

  useEffect(() => {
    fetch('/api/patients').then((r) => r.json()).then(setPatients);
    fetch('/api/inventory').then((r) => r.json()).then(setProducts);
    fetch('/api/inventory/locations').then((r) => (r.ok ? r.json() : [])).then(setLocations).catch(() => {});
  }, []);

  // Al abrir el formulario, ofrece recuperar un borrador guardado localmente
  // (ej. la conexión se cortó a mitad de escribir la nota en el domicilio).
  useEffect(() => {
    loadDraft<{ form: MedicalRecordFormData; supplies: SupplyRow[]; photos: string[]; locationId: string }>(draftKey).then((draft) => {
      if (!draft || restoredRef.current) return;
      const ageMin = Math.round((Date.now() - draft.savedAt) / 60000);
      toast('Hay un borrador sin guardar de esta consulta', {
        description: ageMin < 1 ? 'Guardado hace instantes' : `Guardado hace ${ageMin} min`,
        duration: 15000,
        action: {
          label: 'Restaurar',
          onClick: () => {
            restoredRef.current = true;
            const { form, supplies: s, photos: p, locationId: l } = draft.data;
            (Object.keys(form) as (keyof MedicalRecordFormData)[]).forEach((k) => setValue(k, form[k] as any));
            setSupplies(s || []);
            setPhotos(p || []);
            setLocationId(l || '');
            toast.success('Borrador restaurado');
          },
        },
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autoguardado local (debounced) mientras se escribe — best-effort, no
  // bloquea el formulario si IndexedDB falla o no está disponible.
  const formValues = watch();
  useEffect(() => {
    const hasContent = formValues.reason || formValues.subjective || formValues.diagnosis || formValues.treatment || photos.length > 0;
    if (!hasContent) return;
    const timer = setTimeout(() => {
      saveDraft(draftKey, { form: formValues, supplies, photos, locationId }).then(() => setLastSavedAt(Date.now()));
    }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(formValues), JSON.stringify(supplies), photos.length, locationId]);

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    if (photos.length + files.length > 6) { toast.error('Máximo 6 fotos por consulta'); return; }

    setCompressing(true);
    try {
      const compressed = await Promise.all(files.map((f) => compressImage(f)));
      setPhotos((prev) => [...prev, ...compressed]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo procesar la imagen');
    } finally {
      setCompressing(false);
    }
  }
  function removePhoto(i: number) { setPhotos(photos.filter((_, idx) => idx !== i)); }

  function addSupply() { setSupplies([...supplies, { productId: '', quantity: '' }]); }
  function removeSupply(i: number) { setSupplies(supplies.filter((_, idx) => idx !== i)); }
  function updateSupply(i: number, field: keyof SupplyRow, value: string) {
    const updated = [...supplies];
    updated[i] = { ...updated[i], [field]: value };
    setSupplies(updated);
  }

  async function onSubmit(data: MedicalRecordFormData) {
    const invalidSupply = supplies.some((s) => s.productId && (!s.quantity || Number(s.quantity) <= 0));
    if (invalidSupply) { setError('Cada insumo usado debe tener una cantidad mayor a 0'); return; }

    setLoading(true);
    setError('');
    const vitalSigns: Record<string, number> = {};
    if (data.temperature) vitalSigns.temperature = parseFloat(data.temperature);
    if (data.heartRate) vitalSigns.heartRate = parseInt(data.heartRate);
    if (data.weight) vitalSigns.weight = parseFloat(data.weight);
    if (data.respiratoryRate) vitalSigns.respiratoryRate = parseInt(data.respiratoryRate);

    const suppliesUsed = supplies
      .filter((s) => s.productId && s.quantity)
      .map((s) => ({
        productId: Number(s.productId),
        quantity: Number(s.quantity),
        locationId: locationId ? Number(locationId) : null,
      }));

    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: Number(data.patientId),
        appointmentId: appointmentId || null,
        reason: data.reason,
        subjective: data.subjective,
        diagnosis: data.diagnosis,
        treatment: data.treatment,
        observations: data.observations,
        vitalSigns: Object.keys(vitalSigns).length > 0 ? vitalSigns : null,
        suppliesUsed: suppliesUsed.length > 0 ? suppliesUsed : null,
        photos: photos.length > 0 ? photos : null,
      }),
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error || 'Error al guardar'); setError(json.error || 'Error al guardar'); setLoading(false); return; }
    await deleteDraft(draftKey);
    toast.success('Registro médico guardado correctamente');
    setTimeout(() => { window.location.href = `/pacientes/${data.patientId}`; }, 500);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-2xl">
      {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}
      {lastSavedAt && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <CloudCheck className="h-3.5 w-3.5" /> Borrador guardado en este dispositivo
        </p>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Paciente *</label>
        <select {...register('patientId')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
          <option value="">Seleccionar paciente...</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>{p.name} — {p.ownerFirstName} {p.ownerLastName}</option>
          ))}
        </select>
        {errors.patientId && <p className="text-red-500 text-xs mt-1">{errors.patientId.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Motivo de consulta *</label>
        <input {...register('reason')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        {errors.reason && <p className="text-red-500 text-xs mt-1">{errors.reason.message}</p>}
      </div>

      {/* Formato SOAP: Subjetivo → Objetivo (signos vitales) → Evaluación (diagnóstico) → Plan (tratamiento) */}
      <div>
        <label className="block text-sm font-medium mb-1">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-primary/10 text-primary text-xs font-bold mr-1.5">S</span>
          Subjetivo <span className="font-normal text-muted-foreground">— lo que reporta el tutor</span>
        </label>
        <textarea {...register('subjective')} rows={2} placeholder="Ej.: el tutor reporta que el paciente lleva 2 días con menos apetito y algo decaído..."
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
      </div>

      <div>
        <p className="text-sm font-medium mb-2">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-primary/10 text-primary text-xs font-bold mr-1.5">O</span>
          Objetivo <span className="font-normal text-muted-foreground">— signos vitales</span>
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Temperatura (°C)</label>
            <input type="number" step="0.1" {...register('temperature')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">FC (lpm)</label>
            <input type="number" {...register('heartRate')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Peso (kg)</label>
            <input type="number" step="0.01" {...register('weight')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">FR (rpm)</label>
            <input type="number" {...register('respiratoryRate')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium">Insumos utilizados en esta consulta</p>
          <button type="button" onClick={addSupply} className="flex items-center gap-1 text-xs text-primary hover:underline">
            <Plus className="h-3.5 w-3.5" /> Agregar insumo
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          Para insumos/medicamentos de la clínica (ej. 1 ml de un frasco de 100 ml). Descuenta el stock automáticamente al guardar.
        </p>
        {locations.length > 0 && supplies.length > 0 && (
          <div className="mb-2">
            <label className="block text-xs text-muted-foreground mb-1">Descontar del botiquín</label>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)}
              className="w-full sm:w-64 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">Stock general (sin ubicación específica)</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
        {supplies.length > 0 && (
          <div className="space-y-2">
            {supplies.map((s, i) => {
              const product = products.find((p) => String(p.id) === s.productId);
              return (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={s.productId}
                    onChange={(e) => updateSupply(i, 'productId', e.target.value)}
                    className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Seleccionar insumo...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} (stock: {formatQty(p.stock)} {p.unit})</option>
                    ))}
                  </select>
                  <input
                    type="number" step="any" min="0.001"
                    value={s.quantity}
                    onChange={(e) => updateSupply(i, 'quantity', e.target.value)}
                    placeholder="Cant."
                    className="w-24 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <span className="text-xs text-muted-foreground w-12 shrink-0">{product?.unit || ''}</span>
                  <button type="button" onClick={() => removeSupply(i)} className="text-red-400 hover:text-red-600 shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium">Fotos clínicas <span className="font-normal text-muted-foreground">— lesiones, dermatología, conducta</span></p>
          <label className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
            <Camera className="h-3.5 w-3.5" /> {compressing ? 'Procesando...' : 'Agregar foto'}
            <input type="file" accept="image/*" capture="environment" multiple className="hidden" disabled={compressing} onChange={handlePhotoSelect} />
          </label>
        </div>
        {photos.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden border">
                <img src={p} alt={`Foto clínica ${i + 1}`} className="w-full h-full object-cover" />
                <button type="button" onClick={() => removePhoto(i)} aria-label="Quitar foto"
                  className="absolute top-1 right-1 h-6 w-6 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-primary/10 text-primary text-xs font-bold mr-1.5">A</span>
          Evaluación <span className="font-normal text-muted-foreground">— diagnóstico</span>
        </label>
        <textarea {...register('diagnosis')} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-primary/10 text-primary text-xs font-bold mr-1.5">P</span>
          Plan <span className="font-normal text-muted-foreground">— tratamiento</span>
        </label>
        <textarea {...register('treatment')} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Observaciones adicionales</label>
        <textarea {...register('observations')} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors">
          {loading ? 'Guardando...' : 'Guardar Consulta'}
        </button>
        <button type="button" onClick={() => history.back()} className="px-6 py-2 rounded-lg text-sm font-medium border hover:bg-muted transition-colors">
          Cancelar
        </button>
      </div>
    </form>
  );
}
