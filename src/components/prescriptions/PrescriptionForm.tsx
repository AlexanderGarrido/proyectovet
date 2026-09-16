import { fetchFormChoices, safeVisitReturn } from '../../lib/form-context';
import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Patient { id: number; name: string; ownerFirstName?: string; ownerLastName?: string; }
interface MedItem { medicationName: string; dosage: string; frequency: string; duration: string; instructions: string; quantity: string; }

export function PrescriptionForm({ patientId: defaultPatientId, medicalRecordId, returnTo }: { patientId?: number; medicalRecordId?: number; returnTo?: string }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState(defaultPatientId?.toString() || '');
  const [items, setItems] = useState<MedItem[]>([{ medicationName: '', dosage: '', frequency: '', duration: '', instructions: '', quantity: '1' }]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchFormChoices<Patient>('/api/patients', defaultPatientId).then(setPatients).catch((e) => setError(e.message));
  }, []);

  function addItem() { setItems([...items, { medicationName: '', dosage: '', frequency: '', duration: '', instructions: '', quantity: '1' }]); }
  function removeItem(i: number) { setItems(items.filter((_, idx) => idx !== i)); }
  function updateItem(i: number, field: keyof MedItem, value: string) {
    const updated = [...items];
    updated[i] = { ...updated[i], [field]: value };
    setItems(updated);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId) { setError('Selecciona un paciente'); return; }
    if (items.some((it) => !it.medicationName)) { setError('Todos los medicamentos deben tener nombre'); return; }
    setLoading(true);
    setError('');
    try {
    const res = await fetch('/api/prescriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId: Number(patientId), medicalRecordId: Number(patientId) === defaultPatientId ? medicalRecordId || null : null, items, notes }),
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error || 'Error al guardar'); setError(json.error || 'Error al guardar'); setLoading(false); return; }
    toast.success('Receta creada correctamente');
    setTimeout(() => { window.location.href = safeVisitReturn(returnTo) || `/recetas/${json.id}`; }, 500);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar. Reintenta.'); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 max-w-3xl">
      {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

      <div>
        <label className="block text-sm font-medium mb-1">Paciente *</label>
        <select value={patientId} onChange={(e) => setPatientId(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
          <option value="">Seleccionar paciente...</option>
          {patients.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.ownerFirstName} {p.ownerLastName}</option>)}
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">Medicamentos</label>
          <button type="button" onClick={addItem} className="flex items-center gap-1 text-xs text-primary hover:underline">
            <Plus className="h-3.5 w-3.5" /> Agregar medicamento
          </button>
        </div>
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="border rounded-xl p-4 space-y-3 relative">
              {items.length > 1 && (
                <button type="button" onClick={() => removeItem(i)} className="absolute top-3 right-3 text-red-400 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1">Medicamento *</label>
                  <input value={item.medicationName} onChange={(e) => updateItem(i, 'medicationName', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Nombre del medicamento..." />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Dosis</label>
                  <input value={item.dosage} onChange={(e) => updateItem(i, 'dosage', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="500mg, 1 tableta..." />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Frecuencia</label>
                  <input value={item.frequency} onChange={(e) => updateItem(i, 'frequency', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Cada 8 horas, 1 vez al día..." />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Duración</label>
                  <input value={item.duration} onChange={(e) => updateItem(i, 'duration', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="7 días, 2 semanas..." />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Cantidad</label>
                  <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1">Instrucciones adicionales</label>
                  <input value={item.instructions} onChange={(e) => updateItem(i, 'instructions', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Administrar con alimento, no romper tableta..." />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Notas generales</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={loading}
          className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors">
          {loading ? 'Guardando...' : 'Emitir Receta'}
        </button>
        <a href={safeVisitReturn(returnTo) || "/recetas"} className="px-6 py-2 rounded-lg text-sm font-medium border hover:bg-muted transition-colors">Cancelar</a>
      </div>
    </form>
  );
}
