import { useEffect, useState } from 'react';
import { Syringe, Plus, Trash2, ChevronDown, ChevronUp, AlertTriangle, Download } from 'lucide-react';

interface Vaccine {
  id: number;
  name: string;
  brand: string | null;
  batchNumber: string | null;
  applicationDate: string;
  nextDoseDate: string | null;
  notes: string | null;
  veterinarianName: string | null;
}

function parseDate(dateStr: string): Date {
  // Handle both "YYYY-MM-DD" and ISO datetime strings from MySQL/Drizzle
  if (dateStr.length === 10) return new Date(dateStr + 'T12:00:00');
  return new Date(dateStr);
}

function getDaysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseDate(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function nextDoseBadge(dateStr: string) {
  const days = getDaysUntil(dateStr);
  if (days < 0) return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Vencida hace {Math.abs(days)}d</span>;
  if (days === 0) return <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Vence hoy</span>;
  if (days <= 7) return <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">En {days}d</span>;
  if (days <= 30) return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">En {days}d</span>;
  return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">En {days}d</span>;
}

export function VaccineSection({ patientId, canEdit }: { patientId: number; canEdit: boolean }) {
  const [vaccines, setVaccines] = useState<Vaccine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [form, setForm] = useState({
    name: '', brand: '', batchNumber: '',
    applicationDate: new Date().toISOString().split('T')[0],
    nextDoseDate: '', notes: '',
  });

  const load = () => {
    fetch(`/api/vaccines?patientId=${patientId}`)
      .then((r) => r.json())
      .then((d) => { setVaccines(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/vaccines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, patientId }),
      });
      if (res.ok) {
        setForm({ name: '', brand: '', batchNumber: '', applicationDate: new Date().toISOString().split('T')[0], nextDoseDate: '', notes: '' });
        setShowForm(false);
        load();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este registro de vacuna?')) return;
    setDeletingId(id);
    await fetch(`/api/vaccines/${id}`, { method: 'DELETE' });
    setVaccines((prev) => prev.filter((v) => v.id !== id));
    setDeletingId(null);
  };

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Syringe className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Vacunas</h3>
          {vaccines.length > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{vaccines.length}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/api/patients/${patientId}/vaccine-card`}
            target="_blank"
            rel="noopener noreferrer"
            data-astro-prefetch="false"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> Carnet PDF
          </a>
          {canEdit && (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {showForm ? <><ChevronUp className="h-3.5 w-3.5" /> Cancelar</> : <><Plus className="h-3.5 w-3.5" /> Registrar vacuna</>}
            </button>
          )}
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-5 border rounded-lg p-4 bg-muted/30 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Vacuna *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej: Rabia, Parvovirus..."
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Marca / Laboratorio</label>
              <input
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="Ej: Nobivac, Vanguard..."
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Fecha de aplicación *</label>
              <input
                required
                type="date"
                value={form.applicationDate}
                onChange={(e) => setForm({ ...form, applicationDate: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Próxima dosis</label>
              <input
                type="date"
                value={form.nextDoseDate}
                onChange={(e) => setForm({ ...form, nextDoseDate: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Nº de lote</label>
              <input
                value={form.batchNumber}
                onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
                placeholder="Opcional"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Notas</label>
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Opcional"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="text-sm px-4 py-2 border rounded-lg hover:bg-muted transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
              {saving ? 'Guardando...' : 'Guardar vacuna'}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : vaccines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin vacunas registradas.</p>
      ) : (
        <div className="space-y-2">
          {vaccines.map((v) => (
            <div key={v.id} className="border rounded-lg px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{v.name}</span>
                    {v.brand && <span className="text-xs text-muted-foreground">· {v.brand}</span>}
                    {v.nextDoseDate && nextDoseBadge(v.nextDoseDate)}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                    <span>Aplicada: {parseDate(v.applicationDate).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    {v.nextDoseDate && (
                      <span>Próxima: {parseDate(v.nextDoseDate).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    )}
                    {v.batchNumber && <span>Lote: {v.batchNumber}</span>}
                    {v.veterinarianName && <span>Dr. {v.veterinarianName}</span>}
                  </div>
                  {v.notes && <p className="text-xs text-muted-foreground mt-1 italic">{v.notes}</p>}
                </div>
                {canEdit && (
                  <button
                    onClick={() => handleDelete(v.id)}
                    disabled={deletingId === v.id}
                    className="text-muted-foreground hover:text-red-500 transition-colors shrink-0 p-1"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
