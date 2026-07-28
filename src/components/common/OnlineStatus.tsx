import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Indicador de conexión para trabajo en terreno: sin esto, si la app pierde
 * señal en un domicilio, el veterinario no tiene ninguna señal visual de que
 * las peticiones están fallando — solo lo descubre cuando un guardado no
 * confirma. Aparece únicamente cuando `navigator.onLine` es false.
 *
 * Nota: `navigator.onLine` solo detecta la interfaz de red, no si el backend
 * responde — es una señal aproximada, no una garantía de conectividad real.
 */
export function OnlineStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-1.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 px-3 py-1.5 text-xs font-medium"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span className="hidden sm:inline">Sin conexión — los cambios podrían no guardarse</span>
      <span className="sm:hidden">Sin conexión</span>
    </div>
  );
}
