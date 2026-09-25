import { useEffect, useState } from 'react';
import type { DaySnapshot } from '../../lib/visit-types';
import { DAY_SCHEMA_VERSION } from '../../lib/visit-types';
import { clinicTime } from '../../lib/clinic-time';
import { storageIsPersistent } from '../../lib/field-storage';

/**
 * La copia diaria aplica topes (visitas, antecedentes por paciente,
 * productos) que antes no aparecían en ninguna parte: veinte consultas
 * descargadas se leían igual que «este paciente solo tiene veinte». Aquí se
 * declara qué entró, qué quedó recortado y qué exige conexión.
 */
export function CoverageNotice({ snapshot }: { snapshot: DaySnapshot }) {
  const [persistent, setPersistent] = useState<boolean | null>(null);
  useEffect(() => { storageIsPersistent().then(setPersistent).catch(() => setPersistent(null)); }, []);

  const coverage = snapshot.coverage;
  if (!coverage) return null;

  const notes: string[] = [];
  if (coverage.visitsTruncated) notes.push(`Se descargaron las primeras ${coverage.visits} visitas del día; puede haber más en línea.`);
  if (coverage.recordsTruncated) notes.push(`Cada paciente trae hasta ${coverage.recordsPerPatient} antecedentes; el historial completo requiere conexión.`);
  if (coverage.productsTruncated) notes.push(`El catálogo descargado llega a ${coverage.products} productos.`);
  if (coverage.clinicalWithheld) notes.push('Los antecedentes clínicos no se incluyen para este rol.');
  if (coverage.directoryTruncated) notes.push(`El directorio trae los primeros ${coverage.directory} pacientes activos por nombre; los demás solo pueden atenderse sin cita con señal.`);
  // Una copia escrita por otra versión del cliente puede no traer todos los
  // campos que esta pantalla espera; conviene volver a prepararla.
  const versionMismatch = (snapshot.schemaVersion ?? 1) !== DAY_SCHEMA_VERSION;

  return (
    <details className="rounded-xl border bg-card p-4 text-sm">
      <summary className="cursor-pointer font-medium">
        Qué incluye la copia de este dispositivo
        {notes.length > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">({notes.length} límite{notes.length === 1 ? '' : 's'})</span>}
      </summary>
      <div className="mt-3 space-y-2 text-muted-foreground">
        <p>
          Preparada a las {clinicTime(snapshot.preparedAt)}: {coverage.visits} visita(s), hasta {coverage.recordsPerPatient} antecedentes
          y {coverage.vaccinesPerPatient} vacunas por paciente, {coverage.products} producto(s) y {snapshot.locations.length} botiquín(es).
        </p>
        {notes.map((note) => <p key={note}>· {note}</p>)}
        {versionMismatch && <p className="text-foreground">· Esta copia se guardó con otra versión de la aplicación. Vuelve a prepararla cuando tengas señal; las operaciones pendientes se conservan.</p>}
        <p>
          El stock descargado es informativo: el descuento real ocurre cuando el servidor confirma el consumo.
          {persistent === false && ' El navegador no otorgó almacenamiento persistente, así que podría liberar esta copia si falta espacio.'}
        </p>
      </div>
    </details>
  );
}
