import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { appointmentFormSchema, type AppointmentFormData } from '../../lib/schemas';
import { authClient } from '../../lib/auth-client';
import { toClinicInput } from '../../lib/clinic-time';
import { appointmentRequest, fetchFormData, fetchFormChoices, preserveFormChoice, safeVisitReturn } from '../../lib/form-context';
import { toast } from 'sonner';

interface Patient {
  id: number;
  name: string;
  ownerId: number;
  ownerFirstName?: string;
  ownerLastName?: string;
  ownerAddress?: string;
}

interface Veterinarian {
  id: string;
  name: string;
}

export function AppointmentForm({ appointmentId, patientId, followup = false, returnTo }: { appointmentId?: number; patientId?: number; followup?: boolean; returnTo?: string }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [veterinarians, setVeterinarians] = useState<Veterinarian[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { data: session } = authClient.useSession();

  const { register, handleSubmit, watch, setValue, reset, getValues, formState: { errors } } = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: { type: followup ? 'control' : 'consulta', patientId: patientId?.toString() || '' },
  });

  const selectedPatientId = watch('patientId');

  useEffect(() => {
    async function load() {
      try {
        const a = appointmentId ? await fetchFormData<AppointmentFormData & { veterinarianName?: string | null }>(`/api/appointments/${appointmentId}`) : undefined;
        const [p, v] = await Promise.all([
          fetchFormChoices<Patient>('/api/patients', a ? Number(a.patientId) : patientId),
          fetchFormData<Veterinarian[]>('/api/veterinarians'),
        ]);
        setPatients(p);
        setVeterinarians(preserveFormChoice(v, a ? {
          id: a.veterinarianId,
          name: `${a.veterinarianName || 'Profesional asignado'} (asignación actual; no activo)`,
        } : undefined));
        if (a) reset({ ...a, patientId: String(a.patientId), ownerId: String(a.ownerId),
          scheduledAt: toClinicInput(a.scheduledAt), endAt: toClinicInput(a.endAt),
          visitAddress: a.visitAddress || '', sector: a.sector || '', travelBufferMinutes: String(a.travelBufferMinutes ?? 0),
          reason: a.reason || '', notes: a.notes || '' });
        setReady(true);
      } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar la cita'); }
    }
    void load();
  }, []);

  // Preselecciona al veterinario en sesión (si es uno), pero el campo queda
  // visible y editable para cuando recepción agenda a nombre de otro vet.
  useEffect(() => {
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (!appointmentId && !getValues('veterinarianId') && session?.user?.id && role === 'veterinario') {
      setValue('veterinarianId', session.user.id);
    }
  }, [session]);

  useEffect(() => {
    if (selectedPatientId) {
      const p = patients.find((p) => String(p.id) === selectedPatientId);
      if (p && !appointmentId) {
        setValue('ownerId', String(p.ownerId));
        if (!appointmentId) {
          setValue('visitAddress', p.ownerAddress || '');
        }
      }
    }
  }, [selectedPatientId, patients]);

  async function onSubmit(data: AppointmentFormData) {
    if (!ready) return;
    setLoading(true);
    setError('');
    const url = appointmentId ? `/api/appointments/${appointmentId}` : '/api/appointments';
    const method = appointmentId ? 'PUT' : 'POST';
    try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appointmentRequest(data)),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error || 'Error al guardar'); toast.error(json.error || 'Error al guardar'); setLoading(false); return; }
    toast.success(appointmentId ? 'Cita actualizada' : 'Cita programada correctamente');
    setTimeout(() => { window.location.href = `/citas/${json.id}`; }, 500);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar. Reintenta.'); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-2xl">
      {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">Paciente *</label>
          <select aria-disabled={!!appointmentId} {...register('patientId')} onChange={appointmentId ? () => {} : register('patientId').onChange} value={appointmentId ? selectedPatientId : undefined} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">Seleccionar paciente...</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {p.ownerFirstName} {p.ownerLastName}</option>
            ))}
          </select>
          {errors.patientId && <p className="text-red-500 text-xs mt-1">{errors.patientId.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Tipo *</label>
          <select {...register('type')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="consulta">Consulta</option>
            <option value="vacunacion">Vacunación</option>
            <option value="cirugia">Cirugía</option>
            <option value="control">Control</option>
            <option value="emergencia">Emergencia</option>
            <option value="desparasitacion">Desparasitación</option>
            <option value="grooming">Grooming</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Veterinario *</label>
          <select {...register('veterinarianId')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">Seleccionar veterinario...</option>
            {veterinarians.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          {errors.veterinarianId && <p className="text-red-500 text-xs mt-1">{errors.veterinarianId.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Fecha y hora inicio *</label>
          <input type="datetime-local" {...register('scheduledAt')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          {errors.scheduledAt && <p className="text-red-500 text-xs mt-1">{errors.scheduledAt.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Fecha y hora fin *</label>
          <input type="datetime-local" {...register('endAt')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          {errors.endAt && <p className="text-red-500 text-xs mt-1">{errors.endAt.message}</p>}
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">Dirección de la visita</label>
          <input
            {...register('visitAddress')}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Dirección donde se realizará la visita..."
          />
          <p className="text-xs text-muted-foreground mt-1">Se pre-llena con la dirección del tutor al seleccionar paciente.</p>
        </div>

        {/* La agenda a domicilio ocupa también el tiempo del viaje: sin
            declararlo, dos visitas seguidas en extremos opuestos de la
            ciudad se ven como compatibles. */}
        <div>
          <label className="block text-sm font-medium mb-1">Sector</label>
          <input {...register('sector')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Ej. norte, centro, costa" />
          <p className="text-xs text-muted-foreground mt-1">Agrupación operativa propia de la clínica.</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Colchón de traslado (min)</label>
          <input type="number" min="0" max="240" {...register('travelBufferMinutes')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="0" />
          <p className="text-xs text-muted-foreground mt-1">Se reserva después de la visita y se considera al validar solapamientos.</p>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">Motivo</label>
          <input {...register('reason')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Motivo de la consulta..." />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">Notas adicionales</label>
          <textarea {...register('notes')} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
        </div>

        <input type="hidden" {...register('ownerId')} />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={loading || !ready} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors">
          {loading ? 'Guardando...' : appointmentId ? 'Actualizar Cita' : 'Programar Cita'}
        </button>
        <a href={safeVisitReturn(returnTo) || (appointmentId ? `/citas/${appointmentId}` : "/citas")} className="px-6 py-2 rounded-lg text-sm font-medium border hover:bg-muted transition-colors">Cancelar</a>
      </div>
    </form>
  );
}
