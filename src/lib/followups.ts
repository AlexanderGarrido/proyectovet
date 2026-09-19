import { and, asc, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import { db } from '../db';
import { followupTasks, type NewFollowupTask } from '../db/schema/followups';
import { appointments } from '../db/schema/appointments';
import { patients } from '../db/schema/patients';
import { users } from '../db/schema/users';
import { clinicDay, addClinicDays } from './clinic-time';

export interface VisitFollowupContext {
  appointmentId: number;
  patientId: number;
  veterinarianId: string;
  invoiceId: number | null;
  invoiceTotal: number;
  paidCents: number;
  aftercare: string[];
}

/**
 * Pendientes que deja una visita cerrada.
 *
 * Se crean dentro de la misma transacción que el cierre: una cola posterior
 * podría perderse justo cuando la atención ya quedó guardada, y el saldo
 * sin cobrar desaparecería de la vista de nadie. La clave de origen hace
 * que reenviar la operación —o procesar una cola antigua tras actualizar—
 * no genere una segunda tarea para el mismo hecho.
 *
 * Cerrar una consulta con saldo pendiente NO deja la atención incompleta:
 * genera una tarea administrativa, que es otra cosa.
 */
export async function createVisitFollowups(tx: { insert: any }, context: VisitFollowupContext) {
  const pending: NewFollowupTask[] = [];

  if (context.invoiceId && context.paidCents < context.invoiceTotal) {
    pending.push({
      kind: 'cobro_pendiente',
      title: 'Cobro pendiente de la visita',
      detail: 'La atención se cerró con saldo. Confirmar el pago o acordar su forma con el responsable.',
      patientId: context.patientId,
      appointmentId: context.appointmentId,
      assignedTo: context.veterinarianId,
      dueDate: addClinicDays(clinicDay(), 3),
      sourceKey: `visit:${context.appointmentId}:cobro`,
      createdBy: context.veterinarianId,
    });
  }

  if (context.aftercare.length) {
    pending.push({
      kind: 'seguimiento',
      title: 'Seguimiento indicado por la prestación realizada',
      // Las indicaciones vienen del catálogo, no de una lectura clínica
      // automática: quedan como recordatorio para revisar, no como orden.
      detail: context.aftercare.slice(0, 5).join('\n'),
      patientId: context.patientId,
      appointmentId: context.appointmentId,
      assignedTo: context.veterinarianId,
      dueDate: addClinicDays(clinicDay(), 7),
      sourceKey: `visit:${context.appointmentId}:seguimiento`,
      createdBy: context.veterinarianId,
    });
  }

  if (!pending.length) return;
  // `sourceKey` es único: el conflicto es el mecanismo de deduplicación,
  // no un error que haya que reportar.
  await tx.insert(followupTasks).values(pending).onConflictDoNothing({ target: followupTasks.sourceKey });
}

export interface TaskRow {
  id: number; kind: string; title: string; detail: string | null;
  patientId: number | null; patientName: string | null;
  appointmentId: number | null; dueDate: string | null; status: string;
  assignedTo: string | null; assignedName: string | null; overdue: boolean;
}

/**
 * Bandeja de pendientes. Un veterinario ve lo suyo y lo sin asignar;
 * administración y recepción ven todo, porque parte de su trabajo es
 * justamente repartir lo que quedó sin dueño.
 */
export async function loadTasks(user: { id: string; role: string }, options: { includeDone?: boolean; limit?: number } = {}): Promise<TaskRow[]> {
  const today = clinicDay();
  const rows = await db
    .select({
      id: followupTasks.id, kind: followupTasks.kind, title: followupTasks.title, detail: followupTasks.detail,
      patientId: followupTasks.patientId, patientName: patients.name,
      appointmentId: followupTasks.appointmentId, dueDate: followupTasks.dueDate,
      status: followupTasks.status, assignedTo: followupTasks.assignedTo, assignedName: users.name,
    })
    .from(followupTasks)
    .leftJoin(patients, eq(followupTasks.patientId, patients.id))
    .leftJoin(users, eq(followupTasks.assignedTo, users.id))
    .where(and(
      options.includeDone ? undefined : inArray(followupTasks.status, ['pendiente', 'en_curso']),
      user.role === 'veterinario'
        ? or(eq(followupTasks.assignedTo, user.id), isNull(followupTasks.assignedTo))
        : undefined,
    ))
    .orderBy(asc(followupTasks.dueDate), asc(followupTasks.id))
    .limit(Math.min(200, options.limit ?? 50));

  return rows.map((row) => ({ ...row, overdue: Boolean(row.dueDate && row.dueDate < today && ['pendiente', 'en_curso'].includes(row.status)) }));
}

/** Tareas vencidas del día, para el cierre de jornada. */
export async function overdueCount(user: { id: string; role: string }): Promise<number> {
  const rows = await db.select({ id: followupTasks.id }).from(followupTasks)
    .where(and(
      inArray(followupTasks.status, ['pendiente', 'en_curso']),
      lte(followupTasks.dueDate, clinicDay()),
      user.role === 'veterinario' ? eq(followupTasks.assignedTo, user.id) : undefined,
    ))
    .limit(500);
  return rows.length;
}

/** Visitas iniciadas y no cerradas: el pendiente más caro de olvidar. */
export async function unclosedVisits(user: { id: string; role: string }, day = clinicDay()) {
  const rows = await db
    .select({ id: appointments.id, patientId: appointments.patientId, patientName: patients.name, status: appointments.status, scheduledAt: appointments.scheduledAt })
    .from(appointments)
    .innerJoin(patients, eq(appointments.patientId, patients.id))
    .where(and(
      inArray(appointments.status, ['en_camino', 'en_curso']),
      user.role === 'veterinario' ? eq(appointments.veterinarianId, user.id) : undefined,
    ))
    .orderBy(asc(appointments.scheduledAt))
    .limit(50);
  return rows.filter((row) => row.scheduledAt.toISOString().slice(0, 10) <= day);
}
