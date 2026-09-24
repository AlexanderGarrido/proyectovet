import { useState, useEffect } from 'react';
import { Search, Plus, PawPrint, Dog, Cat, Bird, Rabbit, FileText, CalendarPlus, AlertCircle, type LucideIcon } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';
import { EmptyState } from '../ui/empty-state';
import { Button } from '../ui/button';

interface Patient {
  id: number;
  name: string;
  species: string;
  breed?: string;
  sex: string;
  isActive: boolean;
  ownerFirstName?: string;
  ownerLastName?: string;
  ownerPhone?: string;
  hasPhoto?: boolean;
  updatedAt?: string;
}

const speciesStyle: Record<string, { icon: LucideIcon; bg: string; fg: string; pill: string }> = {
  perro:  { icon: Dog,      bg: 'bg-green-100',  fg: 'text-green-700',  pill: 'bg-green-100 text-green-800' },
  gato:   { icon: Cat,      bg: 'bg-amber-100',  fg: 'text-amber-700',  pill: 'bg-amber-100 text-amber-800' },
  ave:    { icon: Bird,     bg: 'bg-sky-100',    fg: 'text-sky-700',    pill: 'bg-sky-100 text-sky-800' },
  conejo: { icon: Rabbit,   bg: 'bg-pink-100',   fg: 'text-pink-700',   pill: 'bg-pink-100 text-pink-800' },
  reptil: { icon: PawPrint, bg: 'bg-emerald-100',fg: 'text-emerald-700',pill: 'bg-emerald-100 text-emerald-800' },
  roedor: { icon: PawPrint, bg: 'bg-orange-100', fg: 'text-orange-700', pill: 'bg-orange-100 text-orange-800' },
  otro:   { icon: PawPrint, bg: 'bg-muted',      fg: 'text-muted-foreground', pill: 'bg-muted text-muted-foreground' },
};

const FILTERS = ['todos', 'perro', 'gato', 'ave', 'conejo', 'reptil', 'roedor', 'otro'] as const;
const PAGE_SIZE = 24;

export function PatientList() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('todos');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
        if (search.trim()) params.set('search', search.trim());
        if (filter !== 'todos') params.set('species', filter);
        const res = await fetch(`/api/patients?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error('Error al cargar pacientes');
        const data: Patient[] = await res.json();
        if (!controller.signal.aborted) {
          setPatients(data);
          setTotal(Number(res.headers.get('X-Total-Count') || data.length));
        }
      } catch {
        if (!controller.signal.aborted) setError('No se pudieron cargar los pacientes');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, search ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, filter, page, retry]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Nombre, raza, responsable o teléfono"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            aria-label="Buscar paciente"
            className="w-full min-h-11 pl-9 pr-4 py-2 border rounded-lg bg-card text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <a
          href="/pacientes/nuevo"
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo paciente
        </a>
      </div>

      <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filtrar por especie">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1); }}
            aria-pressed={filter === f}
            className={`min-h-11 text-xs px-3 py-1.5 rounded-full border capitalize transition-colors ${
              filter === f
                ? 'bg-primary/15 text-primary border-primary/40 font-medium'
                : 'bg-card text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {!loading && !error && <p role="status" className="text-sm text-muted-foreground">{total === 0 ? 'Sin pacientes para esta búsqueda' : `${total} ${total === 1 ? 'paciente' : 'pacientes'} · Página ${page} de ${pages}`}</p>}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border overflow-hidden">
              <Skeleton className="h-28 rounded-none" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={AlertCircle}
          title={error}
          action={<Button variant="outline" size="sm" onClick={() => setRetry((n) => n + 1)}>Reintentar</Button>}
        />
      ) : patients.length === 0 ? (
        <EmptyState icon={PawPrint} title="No se encontraron pacientes" description={search || filter !== 'todos' ? 'Prueba con otro nombre o cambia el filtro de especie.' : 'Registra el primer paciente para comenzar.'} action={search || filter !== 'todos' ? <Button variant="outline" size="sm" onClick={() => { setSearch(''); setFilter('todos'); setPage(1); }}>Limpiar filtros</Button> : undefined} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {patients.map((p) => {
            const st = speciesStyle[p.species] || speciesStyle.otro;
            const Icon = st.icon;
            return (
              <div key={p.id} className="rounded-xl border bg-card overflow-hidden flex flex-col hover:border-primary/40 transition-colors">
                <a href={`/pacientes/${p.id}`} className="block relative h-28">
                  {p.hasPhoto ? (
                    <img
                      src={`/api/patients/${p.id}/photo?v=${encodeURIComponent(p.updatedAt || '')}`}
                      alt={`Foto de ${p.name}`}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className={`w-full h-full flex items-center justify-center ${st.bg}`}>
                      <Icon className={`h-12 w-12 ${st.fg}`} aria-hidden="true" />
                    </div>
                  )}
                  <span className={`absolute top-2 left-2 text-[11px] px-2 py-0.5 rounded-full capitalize ${st.pill}`}>
                    {p.species}
                  </span>
                  {!p.isActive && (
                    <span className="absolute top-2 right-2 text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                      inactivo
                    </span>
                  )}
                </a>
                <div className="p-3 flex-1 flex flex-col">
                  <a href={`/pacientes/${p.id}`} className="font-medium text-sm hover:text-primary transition-colors truncate">
                    {p.name}
                  </a>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {p.breed ? `${p.breed} · ` : ''}{p.ownerFirstName} {p.ownerLastName}
                  </p>
                </div>
                <div className="flex border-t text-xs">
                  <a href={`/pacientes/${p.id}?seccion=consultas`} className="flex-1 flex min-h-11 items-center justify-center gap-1.5 py-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border-r">
                    <FileText className="h-3.5 w-3.5" /> Consultas
                  </a>
                  <a href={`/citas/nueva?patientId=${p.id}`} className="flex-1 flex min-h-11 items-center justify-center gap-1.5 py-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                    <CalendarPlus className="h-3.5 w-3.5" /> Cita
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!loading && !error && total > PAGE_SIZE && <nav aria-label="Páginas de pacientes" className="flex items-center justify-center gap-3 pt-2">
        <button type="button" disabled={page === 1} onClick={() => setPage((n) => n - 1)} className="min-h-11 rounded-lg border px-4 text-sm font-medium hover:bg-muted disabled:opacity-40">Anterior</button>
        <span className="text-sm text-muted-foreground">{page} de {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => setPage((n) => n + 1)} className="min-h-11 rounded-lg border px-4 text-sm font-medium hover:bg-muted disabled:opacity-40">Siguiente</button>
      </nav>}
    </div>
  );
}
