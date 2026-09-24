import { useState, useEffect } from 'react';
import { Search, Users, Eye, AlertCircle, Mail, Phone, PawPrint } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';
import { EmptyState } from '../ui/empty-state';
import { Button } from '../ui/button';

interface Owner {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  petCount: number;
}

export function OwnerList() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(fetchOwners, 250);
    return () => clearTimeout(t);
  }, [search]);

  async function fetchOwners() {
    setLoading(true);
    setError('');
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await fetch(`/api/owners${params}`);
      if (!res.ok) throw new Error();
      setOwners(await res.json());
    } catch {
      setError('No se pudieron cargar los tutores');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nombre, email o teléfono..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar tutor"
            className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <a
          href="/pacientes/nuevo-dueno"
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Users className="h-4 w-4" />
          Nuevo Tutor
        </a>
      </div>

      {loading ? (
        <div className="rounded-xl border overflow-hidden">
          <div className="bg-muted/50 p-3"><Skeleton className="h-4 w-32" /></div>
          <div className="divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        <EmptyState
          icon={AlertCircle}
          title={error}
          action={<Button variant="outline" size="sm" onClick={fetchOwners}>Reintentar</Button>}
        />
      ) : owners.length === 0 ? (
        <EmptyState icon={Users} title="No se encontraron tutores" />
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <caption className="sr-only">Lista de tutores</caption>
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Contacto</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mascotas</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {owners.map((o) => (
                <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{o.firstName} {o.lastName}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    <div className="flex flex-col gap-0.5">
                      {o.email && <span className="flex items-center gap-1 text-xs"><Mail className="h-3 w-3" /> {o.email}</span>}
                      {o.phone && <span className="flex items-center gap-1 text-xs"><Phone className="h-3 w-3" /> {o.phone}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <PawPrint className="h-3.5 w-3.5" /> {o.petCount}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <a href={`/tutores/${o.id}`} className="flex items-center gap-1 text-primary hover:underline text-xs">
                      <Eye className="h-3.5 w-3.5" /> Ver
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
