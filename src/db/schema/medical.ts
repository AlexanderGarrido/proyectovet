import {
  pgTable,
  varchar,
  integer,
  serial,
  text,
  timestamp,
  date,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { patients } from './patients';
import { products } from './inventory';

export const medicalRecords = pgTable('medical_records', {
  id: serial('id').primaryKey(),
  patientId: integer('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  veterinarianId: varchar('veterinarian_id', { length: 36 })
    .notNull()
    .references(() => users.id),
  appointmentId: integer('appointment_id'),
  date: timestamp('date').notNull(),
  reason: varchar('reason', { length: 255 }).notNull(),
  // Campo "Subjetivo" del formato SOAP: lo que el tutor reporta/observa en
  // casa (motivo narrado), distinto de "reason" (motivo corto de agenda).
  subjective: text('subjective'),
  diagnosis: text('diagnosis'),
  treatment: text('treatment'),
  observations: text('observations'),
  vitalSigns: jsonb('vital_signs').$type<{
    temperature?: number;
    heartRate?: number;
    weight?: number;
    respiratoryRate?: number;
  }>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idxPatientId: index('idx_medical_records_patient').on(t.patientId),
  idxDate: index('idx_mr_date').on(t.date),
}));

export const vaccines = pgTable('vaccines', {
  id: serial('id').primaryKey(),
  patientId: integer('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  veterinarianId: varchar('veterinarian_id', { length: 36 })
    .notNull()
    .references(() => users.id),
  name: varchar('name', { length: 100 }).notNull(),
  brand: varchar('brand', { length: 100 }),
  batchNumber: varchar('batch_number', { length: 50 }),
  applicationDate: date('application_date').notNull(),
  nextDoseDate: date('next_dose_date'),
  notes: text('notes'),
  // Vincula la dosis aplicada con el producto del inventario (categoría
  // "vacuna") para poder descontar automáticamente el stock del botiquín.
  // Opcional: nullable para no romper vacunas ya registradas sin vínculo.
  productId: integer('product_id').references(() => products.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idxNextDoseDate: index('idx_vac_next_dose_date').on(t.nextDoseDate),
}));

// Fotos clínicas tomadas en terreno durante la consulta (lesiones,
// dermatología, conducta) — comprimidas del lado del cliente antes de
// subir (ver compressImage() en lib/image.ts) para no disparar el peso de
// la base de datos como pasaría con fotos sin comprimir.
export const medicalRecordAttachments = pgTable('medical_record_attachments', {
  id: serial('id').primaryKey(),
  medicalRecordId: integer('medical_record_id')
    .notNull()
    .references(() => medicalRecords.id, { onDelete: 'cascade' }),
  photo: text('photo').notNull(), // data URL base64, ya comprimida
  caption: varchar('caption', { length: 200 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idxMedicalRecordId: index('idx_mr_attachments_record').on(t.medicalRecordId),
}));

export type MedicalRecord = typeof medicalRecords.$inferSelect;
export type NewMedicalRecord = typeof medicalRecords.$inferInsert;
export type Vaccine = typeof vaccines.$inferSelect;
export type NewVaccine = typeof vaccines.$inferInsert;
export type MedicalRecordAttachment = typeof medicalRecordAttachments.$inferSelect;
