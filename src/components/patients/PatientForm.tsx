import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PawPrint } from 'lucide-react';
import { patientFormSchema, type PatientFormData } from '../../lib/schemas';
import { toast } from 'sonner';

interface Owner { id: number; firstName: string; lastName: string; email?: string | null; userId?: string | null; }

interface Props {
  patientId?: number;
  defaultOwnerId?: number;
}

async function compressImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 360;
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.72));
    };
    img.src = URL.createObjectURL(file);
  });
}

export function PatientForm({ patientId, defaultOwnerId }: Props) {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<PatientFormData>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: { ownerId: defaultOwnerId?.toString() || '', species: 'perro', sex: 'macho' },
  });

  useEffect(() => {
    fetch('/api/owners').then((r) => r.json()).then(setOwners);
    if (patientId) {
      fetch(`/api/patients/${patientId}`)
        .then((r) => r.json())
        .then((data) => {
          reset({ ...data, ownerId: String(data.ownerId), weight: data.weight?.toString() || '' });
          if (data.photo) setPhoto(data.photo);
        });
    }
  }, [patientId]);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    setPhoto(compressed);
  }

  async function onSubmit(data: PatientFormData) {
    setLoading(true);
    setError('');
    const url = patientId ? `/api/patients/${patientId}` : '/api/patients';
    const method = patientId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, ownerId: Number(data.ownerId), photo: photo || null }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error || 'Error al guardar'); toast.error(json.error || 'Error al guardar'); setLoading(false); return; }
    toast.success(patientId ? 'Paciente actualizado correctamente' : 'Paciente registrado correctamente');
    setTimeout(() => { window.location.href = `/pacientes/${json.id}`; }, 500);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-2xl">
      {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Foto */}
        <div className="sm:col-span-2 flex items-center gap-4">
          <div
            className="w-20 h-20 rounded-full border-2 border-dashed border-border flex items-center justify-center overflow-hidden cursor-pointer bg-muted shrink-0"
            onClick={() => fileInputRef.current?.click()}
          >
            {photo
              ? <img src={photo} alt="Foto" className="w-full h-full object-cover" />
              : <PawPrint className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
            }
          </div>
          <div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-sm text-primary hover:underline font-medium"
            >
              {photo ? 'Cambiar foto' : 'Subir foto'}
            </button>
            <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG · se comprime automáticamente</p>
            {photo && (
              <button type="button" onClick={() => { setPhoto(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-xs text-red-500 hover:underline mt-1 block">
                Eliminar foto
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Cargar foto del paciente"
            onChange={handlePhotoChange}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">Tutor *</label>
          <select {...register('ownerId')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">Seleccionar tutor...</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.firstName} {o.lastName}
                {o.email ? ` — ${o.email}` : ''}
                {o.userId ? ' ✓ con cuenta' : ''}
              </option>
            ))}
          </select>
          {errors.ownerId && <p className="text-red-500 text-xs mt-1">{errors.ownerId.message}</p>}
          <p className="text-xs text-muted-foreground mt-1">Los tutores con “✓ con cuenta” pueden ver esta mascota en su portal.</p>
          <a href="/pacientes/nuevo-dueno" className="text-xs text-primary hover:underline mt-1 inline-block">+ Registrar nuevo tutor</a>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Nombre *</label>
          <input {...register('name')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Max, Luna, Simba..." />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Especie *</label>
          <select {...register('species')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="perro">Perro</option>
            <option value="gato">Gato</option>
            <option value="ave">Ave</option>
            <option value="conejo">Conejo</option>
            <option value="reptil">Reptil</option>
            <option value="roedor">Roedor</option>
            <option value="otro">Otro</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Sexo *</label>
          <select {...register('sex')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="macho">Macho</option>
            <option value="hembra">Hembra</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Raza</label>
          <input {...register('breed')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Labrador, Siamés..." />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Color</label>
          <input {...register('color')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Negro, dorado..." />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Fecha de nacimiento</label>
          <input type="date" {...register('dateOfBirth')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Peso (kg)</label>
          <input type="number" step="0.01" {...register('weight')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="5.50" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Número de microchip</label>
          <input {...register('microchipNumber')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="985112000123456" />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">Notas</label>
          <textarea {...register('notes')} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" placeholder="Alergias, condiciones especiales..." />
        </div>
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors">
          {loading ? 'Guardando...' : patientId ? 'Actualizar Paciente' : 'Registrar Paciente'}
        </button>
        <a href="/pacientes" className="px-6 py-2 rounded-lg text-sm font-medium border hover:bg-muted transition-colors">
          Cancelar
        </a>
      </div>
    </form>
  );
}
