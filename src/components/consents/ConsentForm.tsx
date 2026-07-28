import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { SignaturePad } from './SignaturePad';

interface Patient { id: number; name: string; ownerFirstName?: string; ownerLastName?: string; }

interface FormData {
  patientId: string;
  type: string;
  description: string;
  signedByName: string;
  signedByRelation: string;
}

const typeLabels: Record<string, string> = {
  cirugia: 'Cirugía',
  eutanasia: 'Eutanasia',
  anestesia: 'Anestesia',
  procedimiento: 'Procedimiento',
  otro: 'Otro',
};

export function ConsentForm({ patientId }: { patientId?: number }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    defaultValues: { patientId: patientId?.toString() || '', type: 'procedimiento' },
  });

  useEffect(() => {
    fetch('/api/patients').then((r) => r.json()).then(setPatients);
  }, []);

  async function onSubmit(data: FormData) {
    if (!signature) { setError('Falta la firma del tutor'); return; }
    if (!data.patientId) { setError('Selecciona un paciente'); return; }

    setLoading(true);
    setError('');
    const res = await fetch('/api/consents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: Number(data.patientId),
        type: data.type,
        description: data.description,
        signedByName: data.signedByName,
        signedByRelation: data.signedByRelation || null,
        signature,
      }),
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error || 'Error al guardar'); setError(json.error || 'Error al guardar'); setLoading(false); return; }
    toast.success('Consentimiento registrado');
    window.location.href = `/api/consents/${json.id}/pdf`;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-xl">
      {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

      <div>
        <label className="block text-sm font-medium mb-1">Paciente *</label>
        <select {...register('patientId', { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
          <option value="">Seleccionar paciente...</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>{p.name} — {p.ownerFirstName} {p.ownerLastName}</option>
          ))}
        </select>
        {errors.patientId && <p className="text-red-500 text-xs mt-1">Selecciona un paciente</p>}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Tipo de procedimiento *</label>
        <select {...register('type', { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
          {Object.entries(typeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Descripción del procedimiento *</label>
        <textarea {...register('description', { required: true })} rows={4}
          placeholder="Describe el procedimiento, riesgos y alternativas conversadas con el tutor..."
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
        {errors.description && <p className="text-red-500 text-xs mt-1">La descripción es requerida</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Nombre de quien firma *</label>
          <input {...register('signedByName', { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          {errors.signedByName && <p className="text-red-500 text-xs mt-1">Requerido</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Relación con el paciente</label>
          <input {...register('signedByRelation')} placeholder="Ej: Tutor, cónyuge del tutor..." className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Firma del tutor *</label>
        <SignaturePad onChange={setSignature} />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors">
          {loading ? 'Guardando...' : 'Registrar consentimiento'}
        </button>
        <button type="button" onClick={() => history.back()} className="px-6 py-2 rounded-lg text-sm font-medium border hover:bg-muted transition-colors">
          Cancelar
        </button>
      </div>
    </form>
  );
}
