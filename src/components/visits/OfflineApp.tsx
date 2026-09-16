import { useEffect, useState } from 'react';
import { currentFieldUser, getDay, syncPending } from '../../lib/field-storage';
import type { DaySnapshot } from '../../lib/visit-types';
import { DayPanel } from './DayPanel';
import { Toaster } from 'sonner';
export function OfflineApp() {
  const [data, setData] = useState<DaySnapshot>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [visitId, setVisitId] = useState<number>();
  useEffect(() => {
    const id = currentFieldUser();
    if (!id) { setLoading(false); return; }
    getDay(id).then((snapshot) => {
      if (snapshot) { setData(snapshot); const match = location.pathname.match(/^\/citas\/(\d+)\/?$/); if (match) setVisitId(Number(match[1])); }
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
    const onOnline = () => syncPending(id).catch((e) => setError(e.message));
    window.addEventListener('online', onOnline); return () => window.removeEventListener('online', onOnline);
  }, []);
  return <main className="min-h-screen bg-background p-4 text-foreground sm:p-6"><div className="mx-auto mb-6 flex max-w-6xl items-center justify-between"><p className="font-semibold text-primary">Alma Veterinaria</p><a className="text-sm text-primary" href="/dashboard">Volver al sistema</a></div>{loading ? <p role="status">Abriendo tu jornada…</p> : data ? <DayPanel initial={data} offline initialVisitId={visitId} /> : <section className="mx-auto max-w-xl rounded-xl border bg-card p-6"><h1 className="text-xl font-semibold">No hay una jornada preparada</h1><p className="mt-3 text-sm text-muted-foreground">Con conexión, inicia sesión y selecciona “Preparar sin conexión” en Hoy. Esa copia permite abrir tus visitas y guardar la atención en este dispositivo.</p><a className="mt-4 inline-block text-primary" href="/login">Iniciar sesión</a></section>}{error && <p role="alert" className="mt-4 text-red-600">{error}</p>}<Toaster richColors /></main>;
}
