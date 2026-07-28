import { pgTable, varchar, integer, serial, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { users } from './users';
import { patients } from './patients';

export const consentTypeEnum = pgEnum('consent_type', [
  'cirugia',
  'eutanasia',
  'anestesia',
  'procedimiento',
  'otro',
]);

/**
 * Consentimiento informado firmado por el tutor en el domicilio (cirugía,
 * eutanasia, anestesia, u otro procedimiento de riesgo). La firma se
 * captura en un canvas táctil y se guarda como PNG base64 — mismo patrón
 * que la foto de perfil de paciente (dato pequeño, sin necesidad de un
 * bucket de almacenamiento aparte).
 */
export const consentForms = pgTable('consent_forms', {
  id: serial('id').primaryKey(),
  patientId: integer('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  veterinarianId: varchar('veterinarian_id', { length: 36 })
    .notNull()
    .references(() => users.id),
  type: consentTypeEnum('type').notNull(),
  description: text('description').notNull(),
  // Nombre impreso de quien firma (puede diferir del tutor principal —
  // ej. la pareja del tutor presente en el domicilio) y su relación.
  signedByName: varchar('signed_by_name', { length: 200 }).notNull(),
  signedByRelation: varchar('signed_by_relation', { length: 100 }),
  signature: text('signature').notNull(), // PNG base64 del canvas de firma
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type ConsentForm = typeof consentForms.$inferSelect;
export type NewConsentForm = typeof consentForms.$inferInsert;
