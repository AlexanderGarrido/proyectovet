import * as React from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ErrorStateProps {
  title?: string;
  /** Texto para la persona; no volcar aquí detalles técnicos del servidor. */
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Varias listas convertían un fallo de carga en un array vacío, así que la
 * pantalla decía «no hay datos» cuando en realidad no se pudo leer nada.
 * Son dos hechos distintos y llevan a decisiones distintas: uno se resuelve
 * creando el registro, el otro reintentando. `EmptyState` es para el
 * primero; este componente para el segundo.
 */
function ErrorState({
  title = 'No se pudo cargar',
  description = 'Revisa tu conexión y vuelve a intentarlo. No se perdió información.',
  onRetry,
  retryLabel = 'Reintentar',
  action,
  className,
}: ErrorStateProps) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center px-4 py-12 text-center', className)}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <TriangleAlert className="h-6 w-6 text-destructive" aria-hidden />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {(onRetry || action) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-input bg-background px-4 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              {retryLabel}
            </button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}

export { ErrorState };
