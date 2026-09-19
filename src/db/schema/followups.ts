import {
  pgTable,
  varchar,
  integer,
  serial,
  text,
  timestamp,
  date,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { patients } from './patients';
import { appointments } from './appointments';

export const taskStatusEnum = pgEnum('task_status', ['pendiente', 'en_curso', 'completada', 'descartada']);
export const taskKindEnum = pgEnum('task_kind', [
  'consulta_por_cerrar',
  'resultado_por_revisar',
  'seguimiento',
  'cobro_pendiente',
  'contacto',
  'otra',
]);

/**
 * Pendientes del equipo. Una tarea administrativa NO es una cita: cerrar
 * una consulta puede dejar un cobro pendiente sin que la atención quede
 * incompleta, y hasta ahora ambas cosas se mezclaban en el estado de la
 * cita.
 */
export const followupTasks = pgTable('followup_tasks', {
  id: serial('id').primaryKey(),
  kind: taskKindEnum('task_kind').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  detail: text('detail'),
  patientId: integer('patient_id').references(() => patients.id, { onDelete: 'cascade' }),
  appointmentId: integer('appointment_id').references(() => appointments.id, { onDelete: 'set null' }),
  assignedTo: varchar('assigned_to', { length: 36 }).references(() => users.id),
  dueDate: date('due_date'),
  status: taskStatusEnum('task_status').notNull().default('pendiente'),
  // Clave de origen: identifica el hecho que generó la tarea (por ejemplo
  // "visit:57:cobro"). Con índice único, reprocesar el mismo hecho —una
  // operación reenviada, una cola antigua— no crea una segunda tarea.
  sourceKey: varchar('source_key', { length: 120 }),
  createdBy: varchar('created_by', { length: 36 }).references(() => users.id),
  completedBy: varchar('completed_by', { length: 36 }).references(() => users.id),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  uqSource: uniqueIndex('uq_followup_source').on(t.sourceKey),
  idxStatus: index('idx_followup_status').on(t.status),
  idxAssigned: index('idx_followup_assigned').on(t.assignedTo),
  idxDue: index('idx_followup_due').on(t.dueDate),
}));

export const communicationChannelEnum = pgEnum('communication_channel', ['whatsapp', 'llamada', 'correo', 'presencial', 'otro']);

/**
 * Estados deliberadamente conservadores: abrir un enlace de WhatsApp no
 * prueba que el mensaje se envió, y enviarlo no prueba que se entregó.
 * «entregado» solo puede escribirlo una integración que lo acredite; hoy
 * no existe ninguna, así que en la práctica no se usa.
 */
export const communicationStatusEnum = pgEnum('communication_status', ['preparado', 'enviado_manual', 'entregado', 'fallido']);

export const communicationEvents = pgTable('communication_events', {
  id: serial('id').primaryKey(),
  patientId: integer('patient_id').references(() => patients.id, { onDelete: 'cascade' }),
  appointmentId: integer('appointment_id').references(() => appointments.id, { onDelete: 'set null' }),
  taskId: integer('task_id').references(() => followupTasks.id, { onDelete: 'set null' }),
  channel: communicationChannelEnum('communication_channel').notNull(),
  status: communicationStatusEnum('communication_status').notNull().default('preparado'),
  summary: varchar('summary', { length: 300 }),
  body: text('body'),
  createdBy: varchar('created_by', { length: 36 }).notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idxPatient: index('idx_communication_patient').on(t.patientId),
}));

export type FollowupTask = typeof followupTasks.$inferSelect;
export type NewFollowupTask = typeof followupTasks.$inferInsert;
export type CommunicationEvent = typeof communicationEvents.$inferSelect;
export type NewCommunicationEvent = typeof communicationEvents.$inferInsert;
