import {
  pgTable,
  varchar,
  integer,
  serial,
  text,
  boolean,
  timestamp,
  time,
  smallint,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { patients, owners } from './patients';

export const appointmentTypeEnum = pgEnum('type', [
  'consulta',
  'vacunacion',
  'cirugia',
  'control',
  'emergencia',
  'desparasitacion',
  'grooming',
]);

export const appointmentStatusEnum = pgEnum('status', [
  'programada',
  'confirmada',
  'en_camino',
  'en_curso',
  'completada',
  'cancelada',
  'no_asistio',
]);

export const appointments = pgTable('appointments', {
  id: serial('id').primaryKey(),
  patientId: integer('patient_id')
    .notNull()
    .references(() => patients.id),
  // Antes sin FK: nada impedía guardar un ownerId que no existiera en
  // `owners`. Sin integridad referencial en una columna que además decide
  // qué citas puede ver un tutor (ver IDOR fix), un valor huérfano ahí
  // podría filtrar o esconder datos silenciosamente.
  ownerId: integer('owner_id')
    .notNull()
    .references(() => owners.id),
  veterinarianId: varchar('veterinarian_id', { length: 36 })
    .notNull()
    .references(() => users.id),
  scheduledAt: timestamp('scheduled_at').notNull(),
  endAt: timestamp('end_at').notNull(),
  type: appointmentTypeEnum('type').notNull(),
  status: appointmentStatusEnum('status').notNull().default('programada'),
  reason: varchar('reason', { length: 255 }),
  notes: text('notes'),
  visitAddress: varchar('visit_address', { length: 500 }),
  reminderSent: boolean('reminder_sent').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  idxScheduledAt: index('idx_appointments_scheduled').on(t.scheduledAt),
  idxStatus: index('idx_appointments_status').on(t.status),
  idxPatientId: index('idx_appointments_patient').on(t.patientId),
  idxVetId: index('idx_appointments_vet').on(t.veterinarianId),
  idxOwnerId: index('idx_appt_owner_id').on(t.ownerId),
}));

export const veterinarianSchedules = pgTable('veterinarian_schedules', {
  id: serial('id').primaryKey(),
  veterinarianId: varchar('veterinarian_id', { length: 36 })
    .notNull()
    .references(() => users.id),
  dayOfWeek: smallint('day_of_week').notNull(), // 0=Sunday .. 6=Saturday
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  isActive: boolean('is_active').notNull().default(true),
});

export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
