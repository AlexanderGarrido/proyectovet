import {
  pgTable,
  varchar,
  integer,
  serial,
  text,
  boolean,
  timestamp,
  date,
  jsonb,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { patients } from './patients';
import { appointmentTypeEnum } from './appointments';

/**
 * Plantillas de atención por tipo de visita. Contienen estructura y texto
 * editable — nunca hallazgos. Una plantilla no debe rellenar «sin
 * alteraciones» ni un diagnóstico: eso convertiría en comprobado algo que
 * nadie revisó. Lo que trae es el andamiaje (qué campos corresponden a un
 * control, a una vacunación o a una consulta general) y frases sugeridas
 * que el profesional acepta, edita o descarta.
 */
export const clinicalTemplates = pgTable('clinical_templates', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  visitType: appointmentTypeEnum('type').notNull(),
  /** Campos y su orden; el contenido clínico lo escribe la persona. */
  sections: jsonb('sections').$type<TemplateSection[]>().notNull(),
  /** Frases disponibles para insertar; no se aplican solas. */
  phrases: jsonb('phrases').$type<string[]>().notNull().default([]),
  // Versión: un borrador guardado con la plantilla v1 debe poder abrirse
  // aunque la plantilla ya vaya en la v3, sin que cambie lo ya escrito.
  version: integer('version').notNull().default(1),
  /** null = plantilla de la clínica; con valor, preferencia de ese profesional. */
  ownerUserId: varchar('owner_user_id', { length: 36 }).references(() => users.id, { onDelete: 'cascade' }),
  createdBy: varchar('created_by', { length: 36 }).references(() => users.id),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  idxType: index('idx_clinical_templates_type').on(t.visitType),
  idxOwner: index('idx_clinical_templates_owner').on(t.ownerUserId),
}));

export interface TemplateSection {
  /** Campo del registro clínico al que corresponde. */
  field: 'reason' | 'subjective' | 'diagnosis' | 'treatment' | 'observations';
  label: string;
  /** Texto de apoyo (pregunta o recordatorio), no contenido del registro. */
  hint?: string;
  /** Se muestra plegada al abrir: campos que no siempre aplican. */
  collapsed?: boolean;
}

export const alertCategoryEnum = pgEnum('patient_alert_category', [
  'alergia',
  'conducta',
  'condicion',
  'medicacion',
  'administrativa',
]);

/**
 * Alertas registradas por el profesional (agresividad al manipular,
 * alergia conocida, condición crónica). La ausencia de alertas significa
 * «nadie registró ninguna», no «el paciente no tiene ninguna»: la interfaz
 * debe decirlo con esas palabras.
 */
export const patientAlerts = pgTable('patient_alerts', {
  id: serial('id').primaryKey(),
  patientId: integer('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  category: alertCategoryEnum('patient_alert_category').notNull(),
  text: varchar('text', { length: 300 }).notNull(),
  /** Hasta cuándo aplica; null = sin fecha de término declarada. */
  validUntil: date('valid_until'),
  createdBy: varchar('created_by', { length: 36 }).notNull().references(() => users.id),
  // Retirar una alerta no la borra: se marca resuelta con autor y fecha,
  // porque saber que existió es parte del antecedente.
  resolvedAt: timestamp('resolved_at'),
  resolvedBy: varchar('resolved_by', { length: 36 }).references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idxPatient: index('idx_patient_alerts_patient').on(t.patientId),
}));

export type ClinicalTemplate = typeof clinicalTemplates.$inferSelect;
export type NewClinicalTemplate = typeof clinicalTemplates.$inferInsert;
export type PatientAlert = typeof patientAlerts.$inferSelect;
export type NewPatientAlert = typeof patientAlerts.$inferInsert;
