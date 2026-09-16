import type { VisitSnapshot } from '../../lib/visit-types';
import { CLINIC_TIME_ZONE } from '../../lib/clinic-time';
import { buildWhatsappLink } from '../../lib/whatsapp';

export function summaryText(visit: VisitSnapshot) {
  const records = visit.records.filter((r) => r.appointmentId === visit.id);
  return [`Alma Veterinaria — Resumen de visita`, `Paciente: ${visit.patient.name}`, `Responsable: ${visit.owner.firstName} ${visit.owner.lastName}`,
    `Fecha: ${new Date(visit.scheduledAt).toLocaleString('es-CL', { timeZone: CLINIC_TIME_ZONE })}`, `Profesional: ${visit.veterinarianName || 'Equipo veterinario'}`,
    ...records.flatMap((r) => [`\nMotivo: ${r.reason}`, `Evaluación: ${r.diagnosis || 'Sin registro'}`, `Indicaciones: ${r.treatment || 'Sin indicaciones registradas'}`]),
    '\nConserva las indicaciones y contacta al equipo ante cualquier duda.',
  ].join('\n');
}

export function VisitSummary({ visit, provisional = false }: { visit: VisitSnapshot; provisional?: boolean }) {
  const text = `${provisional ? 'BORRADOR LOCAL — PENDIENTE DE SINCRONIZAR\n\n' : ''}${summaryText(visit)}`;
  const hasRecords = visit.records.some((r) => r.appointmentId === visit.id);
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `visita-${visit.id}.txt`; a.click(); URL.revokeObjectURL(url);
  }
  return <section className="visit-summary rounded-xl border bg-card p-6">
    <style>{`@media print { body * { visibility: hidden; } .visit-summary, .visit-summary * { visibility: visible; } .visit-summary { position: absolute; left: 0; top: 0; width: 100%; border: 0; color: black; background: white; } .visit-summary .print-hide { display: none; } main { overflow: visible !important; } }`}</style>
    <h3 className="text-lg font-semibold">Resumen para el responsable</h3>
    {provisional && <p className="mt-2 text-sm font-semibold">Borrador local pendiente de sincronización. Revisa las indicaciones antes de entregarlas.</p>}
    {hasRecords ? <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed">{text}</pre> : <p className="mt-3 text-sm text-muted-foreground">Guarda y sincroniza la consulta para generar el resumen con sus datos confirmados.</p>}
    {hasRecords && <div className="print-hide mt-5 flex flex-wrap gap-2">
      <button className="rounded-lg border px-4 py-3 text-sm" onClick={() => window.print()}>Imprimir / guardar PDF</button>
      <button className="rounded-lg border px-4 py-3 text-sm" onClick={download}>Descargar texto</button>
      {visit.owner.phone && <a className="rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground" target="_blank" rel="noreferrer" href={buildWhatsappLink(visit.owner.phone, text) || '#'}>Preparar WhatsApp ↗</a>}
      <p className="w-full text-xs text-muted-foreground">El mensaje se abre para que lo revises y lo envíes personalmente.</p>
    </div>}
  </section>;
}
