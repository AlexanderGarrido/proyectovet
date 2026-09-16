import { fetchFormChoices, safeVisitReturn } from '../../lib/form-context';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { FlaskConical } from 'lucide-react';
import { toast } from 'sonner';

interface Patient {
  id: number;
  name: string;
  species: string;
}

interface FormData {
  patientId: string;
  type: string;
  description: string;
}

export function LabOrderForm({ patientId, medicalRecordId, returnTo }: { patientId?: number; medicalRecordId?: number; returnTo?: string }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ defaultValues: { patientId: patientId?.toString() || '' } });

  useEffect(() => {
    fetchFormChoices<Patient>('/api/patients', patientId).then(setPatients).catch((e) => setError(e.message));
  }, []);

  async function onSubmit(data: FormData) {
    setSaving(true);
    setError('');
    try {
    const res = await fetch('/api/lab-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, patientId: Number(data.patientId), medicalRecordId: Number(data.patientId) === patientId ? medicalRecordId : undefined }),
    });
    if (res.ok) {
      toast.success('Orden de examen creada correctamente');
      setTimeout(() => { window.location.href = safeVisitReturn(returnTo) || '/ordenes'; }, 500);
    } else {
      const json = await res.json();
      toast.error(json.error || 'Error al crear la orden');
      setError(json.error || 'Error al crear la orden');
    }
    setSaving(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar. Reintenta.'); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-xl">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">Paciente *</label>
        <select
          {...register('patientId', { required: 'Selecciona un paciente' })}
          className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Seleccionar paciente...</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.species})</option>
          ))}
        </select>
        {errors.patientId && <p className="text-xs text-red-600">{errors.patientId.message}</p>}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Tipo de Examen *</label>
        <select
          {...register('type', { required: 'Selecciona un tipo' })}
          className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Seleccionar tipo...</option>
          <option value="hemograma">Hemograma</option>
          <option value="quimica_sanguinea">Química Sanguínea</option>
          <option value="urinalisis">Urianálisis</option>
          <option value="coproparasitario">Coproparasitario</option>
          <option value="radiografia">Radiografía</option>
          <option value="ecografia">Ecografía</option>
          <option value="cultivo">Cultivo y Antibiograma</option>
          <option value="otro">Otro</option>
        </select>
        {errors.type && <p className="text-xs text-red-600">{errors.type.message}</p>}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Descripción / Indicaciones</label>
        <textarea
          {...register('description')}
          rows={4}
          placeholder="Indicaciones clínicas, sospecha diagnóstica, instrucciones especiales..."
          className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      <div className="flex gap-3">
        <a
          href={safeVisitReturn(returnTo) || "/ordenes"}
          className="flex-1 text-center px-4 py-2 border rounded-lg text-sm hover:bg-muted transition-colors"
        >
          Cancelar
        </a>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <FlaskConical className="h-4 w-4" />
          {saving ? 'Guardando...' : 'Crear Orden'}
        </button>
      </div>
    </form>
  );
}
