import { useState, useEffect } from 'react';
import { Plus, FileSignature, Download, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Skeleton } from '../ui/skeleton';
import { EmptyState } from '../ui/empty-state';
import { Button } from '../ui/button';

interface Consent {
  id: number;
  type: string;
  description: string;
  signedByName: string;
  createdAt: string;
  patientName?: string;
  ownerFirstName?: string;
  ownerLastName?: string;
}

const typeLabels: Record<string, string> = {
  cirugia: 'Cirugía', eutanasia: 'Eutanasia', anestesia: 'Anestesia', procedimiento: 'Procedimiento', otro: 'Otro',
};

export function ConsentList() {
  const [consents, setConsents] = useState<Consent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/consents');
      if (!res.ok) throw new Error();
      setConsents(await res.json());
    } catch {
      setError('No se pudieron cargar los consentimientos');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <a href="/consentimientos/nueva"
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" /> Nuevo Consentimiento
        </a>
      </div>

      {loading ? (
        <div className="rounded-xl border overflow-hidden">
          <div className="bg-muted/50 p-3"><Skeleton className="h-4 w-32" /></div>
          <div className="divide-y">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-24 hidden sm:block" />
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        <EmptyState icon={AlertCircle} title={error} action={<Button variant="outline" size="sm" onClick={fetchData}>Reintentar</Button>} />
      ) : consents.length === 0 ? (
        <EmptyState icon={FileSignature} title="No hay consentimientos registrados" />
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Paciente</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Tutor</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Firmado por</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {consents.map((cf) => (
                <tr key={cf.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground">{format(new Date(cf.createdAt), 'dd/MM/yyyy', { locale: es })}</td>
                  <td className="px-4 py-3 font-medium">{cf.patientName || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{cf.ownerFirstName} {cf.ownerLastName}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{typeLabels[cf.type] || cf.type}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{cf.signedByName}</td>
                  <td className="px-4 py-3">
                    <a href={`/api/consents/${cf.id}/pdf`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline text-xs">
                      <Download className="h-3.5 w-3.5" /> PDF
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
