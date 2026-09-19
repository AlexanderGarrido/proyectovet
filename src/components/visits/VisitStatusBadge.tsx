import { cn } from '../../lib/utils';

/**
 * Único lugar donde se traduce el estado de una cita. Antes cada pantalla
 * tenía su propio mapa (o imprimía el valor crudo con guiones bajos), así
 * que «en_curso» aparecía como «En atención», «En curso» o «en curso» según
 * dónde se mirara.
 */
export const VISIT_STATUS_LABEL: Record<string, string> = {
  programada: 'Programada',
  confirmada: 'Confirmada',
  en_camino: 'En camino',
  en_curso: 'En atención',
  completada: 'Completada',
  cancelada: 'Cancelada',
  no_asistio: 'No realizada',
};

const tone: Record<string, string> = {
  programada: 'bg-muted text-muted-foreground',
  confirmada: 'bg-accent text-accent-foreground',
  en_camino: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  en_curso: 'bg-primary/15 text-primary',
  completada: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  cancelada: 'bg-muted text-muted-foreground line-through',
  no_asistio: 'bg-muted text-muted-foreground',
};

export function visitStatusLabel(status: string): string {
  return VISIT_STATUS_LABEL[status] ?? status.replaceAll('_', ' ');
}

export function VisitStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium', tone[status] ?? tone.programada, className)}>
      {visitStatusLabel(status)}
    </span>
  );
}
