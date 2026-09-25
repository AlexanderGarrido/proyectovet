import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { appointments } from '../db/schema/appointments';
import { patients } from '../db/schema/patients';
import { visitOperations } from '../db/schema/visit-operations';
import { checkOpenTime, VisitError, type OpenVisitInput } from './visit-operation';
import type { VisitUser } from './visits';
import type { VisitResult } from './visit-types';

const PROVISIONAL_MINUTES = 30;

/**
 * Abre una atención sin cita: crea la cita en curso a la hora declarada y
 * guarda el comprobante con el mismo mecanismo que `saveVisit`. Un
 * reintento con el mismo id —típico tras una respuesta perdida en terreno—
 * devuelve la cita ya creada en vez de duplicarla.
 *
 * No valida solapamientos: la atención ya ocurrió. Las citas que se agenden
 * después sí la cuentan como tiempo ocupado.
 */
export async function openVisit(user: VisitUser, input: OpenVisitInput, now = new Date()): Promise<VisitResult> {
  if (!['admin', 'veterinario'].includes(user.role)) throw new VisitError(403, 'Solo administración o un veterinario pueden atender sin cita.');
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${user.id + ':' + input.id}, 0))`);
    const [receipt] = await tx.select().from(visitOperations)
      .where(and(eq(visitOperations.userId, user.id), eq(visitOperations.operationId, input.id)));
    if (receipt) {
      if (receipt.payloadHash !== hash) throw new VisitError(409, 'El identificador de guardado ya se utilizó con otros datos.');
      return receipt.result;
    }
    // La hora se valida después del comprobante: un reintento legítimo de
    // hace más de siete días debe recibir su cita, no un rechazo.
    const origin = input.origin ?? 'sin_cita';
    checkOpenTime(input.occurredAt, now, origin);
    const [patient] = await tx.select({ id: patients.id, ownerId: patients.ownerId, isActive: patients.isActive })
      .from(patients).where(eq(patients.id, input.patientId));
    if (!patient) throw new VisitError(404, 'Paciente no encontrado.');
    if (!patient.isActive) throw new VisitError(409, 'El paciente está inactivo. Reactívalo en su ficha antes de atenderlo.');

    const start = new Date(input.occurredAt);
    // updatedAt explícito: la siguiente operación de la cadena se valida
    // contra este valor exacto, guardado en el comprobante.
    const updatedAt = new Date(now.getTime());
    const [visit] = await tx.insert(appointments).values({
      patientId: patient.id, ownerId: patient.ownerId, veterinarianId: user.id,
      // Una consulta pasada no se cronometró en vivo: sin inicio medido, no
      // entra en el promedio de duración de la jornada.
      scheduledAt: start, startedAt: origin === 'pasada' ? null : start, endAt: new Date(start.getTime() + PROVISIONAL_MINUTES * 60_000),
      type: 'consulta', status: 'en_curso', origin, travelBufferMinutes: 0, updatedAt,
    }).returning({ id: appointments.id });

    const receivedAt = new Date();
    const result: VisitResult = {
      visitId: visit.id, recordId: null, invoiceId: null, status: 'en_curso',
      updatedAt: updatedAt.toISOString(), receivedAt: receivedAt.toISOString(),
    };
    await tx.insert(visitOperations).values({ userId: user.id, operationId: input.id, payloadHash: hash, result, occurredAt: start, receivedAt });
    return result;
  });
}
