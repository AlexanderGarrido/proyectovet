import { fetchFormData } from '../../lib/form-context';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ownerFormSchema, type OwnerFormData } from '../../lib/schemas';

export interface SavedOwner { id: number; firstName: string; lastName: string; email?: string | null; }
interface Props { ownerId?: number; onSaved?: (owner: SavedOwner) => void; onCancel?: () => void; }

export function OwnerForm({ ownerId, onSaved, onCancel }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, reset, formState: { errors } } = useForm<OwnerFormData>({
    resolver: zodResolver(ownerFormSchema),
  });

  useEffect(() => {
    if (!ownerId) return;
    fetchFormData<OwnerFormData>(`/api/owners/${ownerId}`)
      .then((o) => reset({
        firstName: o.firstName, lastName: o.lastName,
        email: o.email || '', phone: o.phone || '',
        address: o.address || '', documentId: o.documentId || '',
      })).catch((e) => setError(e.message));
  }, [ownerId]);

  async function onSubmit(data: OwnerFormData) {
    setLoading(true);
    setError('');
    const url = ownerId ? `/api/owners/${ownerId}` : '/api/owners';
    const method = ownerId ? 'PUT' : 'POST';
    try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error || 'Error al guardar'); setError(json.error || 'Error al guardar'); setLoading(false); return; }
    toast.success(ownerId ? 'Tutor actualizado correctamente' : 'Tutor registrado correctamente');
    if (onSaved) { onSaved(json); return; }
    const nextUrl = ownerId ? `/tutores/${json.id}` : `/pacientes/nuevo?ownerId=${json.id}`;
    setTimeout(() => { window.location.href = nextUrl; }, 500);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar. Reintenta.'); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-2xl">
      {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Nombre *</label>
          <input {...register('firstName')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Apellido *</label>
          <input {...register('lastName')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Correo electrónico</label>
          <input type="email" {...register('email')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Teléfono</label>
          <input {...register('phone')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="+506 8888-8888" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Cédula / Documento</label>
          <input {...register('documentId')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">Dirección</label>
          <textarea {...register('address')} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
        </div>
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors">
          {loading ? 'Guardando...' : ownerId ? 'Actualizar responsable' : 'Registrar responsable'}
        </button>
        <a onClick={onCancel ? (e) => { e.preventDefault(); onCancel(); } : undefined} href="/pacientes" className="px-6 py-2 rounded-lg text-sm font-medium border hover:bg-muted transition-colors">
          Cancelar
        </a>
      </div>
    </form>
  );
}
