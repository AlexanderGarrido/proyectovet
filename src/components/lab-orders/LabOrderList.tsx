import { useState, useEffect } from 'react';
import { FlaskConical, Plus, CheckCircle, Clock, XCircle, FileDown } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Skeleton } from '../ui/skeleton';
import { EmptyState } from '../ui/empty-state';

interface LabOrder {
  id: number;
  type: string;
  description: string | null;
  status: string;
  results: string | null;
  requestedAt: string;
  completedAt: string | null;
  patientName: string | null;
  veterinarianName: string | null;
}

const typeLabels: Record<string, string> = {
  hemograma: 'Hemograma',
  quimica_sanguinea: 'Química Sanguínea',
  urinalisis: 'Urianálisis',
  coproparasitario: 'Coproparasitario',
  radiografia: 'Radiografía',
  ecografia: 'Ecografía',
  cultivo: 'Cultivo y Antibiograma',
  otro: 'Otro',
};

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  solicitado: { label: 'Solicitado', color: 'bg-blue-100 text-blue-700', icon: Clock },
  en_proceso: { label: 'En Proceso', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  completado: { label: 'Completado', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-700', icon: XCircle },
};

interface Props {
  canWrite?: boolean;
}

export function LabOrderList({ canWrite = false }: Props) {
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<LabOrder | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [results, setResults] = useState('');

  useEffect(() => {
    fetchOrders();
  }, []);

  async function fetchOrders() {
    setLoading(true);
    const res = await fetch('/api/lab-orders');
    if (res.ok) setOrders(await res.json());
    setLoading(false);
  }

  const filtered = orders.filter((o) => {
    const matchSearch =
      !search ||
      o.patientName?.toLowerCase().includes(search.toLowerCase()) ||
      typeLabels[o.type]?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  async function updateStatus(id: number, status: string, resultsText?: string) {
    setUpdatingStatus(true);
    await fetch(`/api/lab-orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, results: resultsText }),
    });
    await fetchOrders();
    setUpdatingStatus(false);
    setSelected(null);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="rounded-lg border overflow-hidden">
          <div className="bg-muted/50 p-3"><Skeleton className="h-4 w-32" /></div>
          <div className="divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-24 hidden sm:block" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Buscar por paciente o tipo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todos los estados</option>
          <option value="solicitado">Solicitado</option>
          <option value="en_proceso">En Proceso</option>
          <option value="completado">Completado</option>
          <option value="cancelado">Cancelado</option>
        </select>
        {canWrite && (
          <a
            href="/ordenes/nueva"
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nueva Orden
          </a>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={FlaskConical} title="No hay órdenes registradas" />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Paciente</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Veterinario</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((order) => {
                const cfg = statusConfig[order.status] || statusConfig.solicitado;
                const Icon = cfg.icon;
                return (
                  <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      {typeLabels[order.type] || order.type}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{order.patientName || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{order.veterinarianName || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {format(new Date(order.requestedAt), 'dd/MM/yyyy', { locale: es })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                        <Icon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <a
                          href={`/api/lab-orders/${order.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-astro-prefetch="false"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                          title="Descargar PDF"
                        >
                          <FileDown className="h-3.5 w-3.5" />
                          PDF
                        </a>
                        <button
                          onClick={() => { setSelected(order); setResults(order.results || ''); }}
                          className="text-xs text-primary hover:underline"
                        >
                          Ver / Actualizar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail / Update Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl border w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">{typeLabels[selected.type] || selected.type}</h3>
              <div className="flex items-center gap-3">
                <a
                  href={`/api/lab-orders/${selected.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-astro-prefetch="false"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-muted/50 transition-colors"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Descargar PDF
                </a>
                <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">✕</button>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide">Paciente</dt>
                <dd className="font-medium">{selected.patientName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide">Veterinario</dt>
                <dd>{selected.veterinarianName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide">Solicitado</dt>
                <dd>{format(new Date(selected.requestedAt), "dd/MM/yyyy HH:mm", { locale: es })}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide">Estado Actual</dt>
                <dd className="capitalize">{statusConfig[selected.status]?.label || selected.status}</dd>
              </div>
            </dl>

            {selected.description && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Descripción</p>
                <p className="text-sm bg-muted/30 rounded-lg p-3">{selected.description}</p>
              </div>
            )}

            {canWrite && selected.status !== 'completado' && selected.status !== 'cancelado' && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm font-medium">Actualizar estado</p>
                <textarea
                  value={results}
                  onChange={(e) => setResults(e.target.value)}
                  placeholder="Resultados del examen (opcional)..."
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
                <div className="flex gap-2">
                  {selected.status === 'solicitado' && (
                    <button
                      disabled={updatingStatus}
                      onClick={() => updateStatus(selected.id, 'en_proceso')}
                      className="flex-1 px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 transition-colors disabled:opacity-50"
                    >
                      Marcar En Proceso
                    </button>
                  )}
                  <button
                    disabled={updatingStatus}
                    onClick={() => updateStatus(selected.id, 'completado', results)}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    Marcar Completado
                  </button>
                  <button
                    disabled={updatingStatus}
                    onClick={() => updateStatus(selected.id, 'cancelado')}
                    className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {selected.results && (
              <div className="border-t pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Resultados</p>
                <p className="text-sm bg-muted/30 rounded-lg p-3 whitespace-pre-wrap">{selected.results}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
