import { and, eq, ne } from 'drizzle-orm';
import { db } from '../db';
import { appointments } from '../db/schema/appointments';
import { medicalRecords } from '../db/schema/medical';
import { invoices } from '../db/schema/billing';
import { VisitError } from './visit-operation';
import { canAccessVisit, type VisitUser } from './visits';

/**
 * Descarta una atención sin cita (o una consulta pasada) abierta por error.
 * Se borra por completo: dejarla cancelada llenaría la agenda de errores de
 * dedo. Por lo mismo solo se permite mientras no haya nada que conservar:
 * con nota clínica o con cobro, la atención existió y debe cerrarse.
 *
 * Todo se revalida dentro de la transacción, con la cita bloqueada: la
 * pantalla pudo quedar atrasada respecto de otro dispositivo.
 */
export async function discardVisit(user: VisitUser, visitId: number): Promise<{ discarded: number }> {
  if (!['admin', 'veterinario'].includes(user.role)) throw new VisitError(403, 'Solo administración o un veterinario pueden descartar una atención.');
  return db.transaction(async (tx) => {
    const [visit] = await tx.select().from(appointments).where(eq(appointments.id, visitId)).for('update');
    if (!visit || !canAccessVisit(user, visit.veterinarianId)) throw new VisitError(404, 'Visita no encontrada');
    if (!['sin_cita', 'pasada'].includes(visit.origin)) throw new VisitError(409, 'Solo se descarta una atención sin cita o una consulta pasada. Una cita agendada se cancela desde la agenda.');
    if (visit.status === 'completada') throw new VisitError(409, 'La atención ya está cerrada y no puede descartarse.');
    const [record] = await tx.select({ id: medicalRecords.id }).from(medicalRecords).where(eq(medicalRecords.appointmentId, visitId)).limit(1);
    if (record) throw new VisitError(409, 'La atención ya tiene una nota clínica: ciérrala en vez de descartarla.');
    const [invoice] = await tx.select({ id: invoices.id }).from(invoices)
      .where(and(eq(invoices.appointmentId, visitId), ne(invoices.status, 'anulada'))).limit(1);
    if (invoice) throw new VisitError(409, 'La atención tiene un cobro emitido. Anúlalo desde facturación antes de descartarla.');
    await tx.delete(appointments).where(eq(appointments.id, visitId));
    return { discarded: visitId };
  });
}
