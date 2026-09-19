import {
  pgTable,
  varchar,
  integer,
  serial,
  text,
  boolean,
  timestamp,
  decimal,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { products } from './inventory';
import { appointments } from './appointments';
import { invoices, invoiceItems } from './billing';
import { medicalRecords } from './medical';

/**
 * Catálogo de prestaciones. Hasta ahora una atención se cobraba escribiendo
 * a mano descripción y monto, y los insumos se descontaban por separado: el
 * mismo trabajo se declaraba dos veces y nada garantizaba que coincidieran.
 * Una prestación reúne lo que se hace, lo que cuesta y lo que consume.
 */
export const services = pgTable('services', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 40 }).unique(),
  name: varchar('name', { length: 160 }).notNull(),
  description: text('description'),
  // Precio de venta. Distinto del costo de sus insumos: confundirlos hace
  // imposible saber si una prestación deja margen.
  price: decimal('price', { precision: 12, scale: 2 }).notNull(),
  /** Minutos estimados; alimenta la duración sugerida en la agenda. */
  durationMinutes: integer('duration_minutes'),
  /** Indicaciones de alta sugeridas al seleccionar la prestación. */
  aftercare: text('aftercare'),
  /** Un paquete agrupa otras prestaciones mediante `service_components`. */
  isPackage: boolean('is_package').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: varchar('created_by', { length: 36 }).references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  idxActive: index('idx_services_active').on(t.isActive),
}));

/**
 * Qué consume o contiene una prestación: insumos del inventario y, en un
 * paquete, otras prestaciones. `optional` marca lo que el profesional
 * confirma caso a caso en vez de descontarse siempre.
 */
export const serviceComponents = pgTable('service_components', {
  id: serial('id').primaryKey(),
  serviceId: integer('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  productId: integer('product_id').references(() => products.id),
  childServiceId: integer('child_service_id').references(() => services.id),
  quantity: decimal('quantity', { precision: 12, scale: 3 }).notNull().default('1'),
  optional: boolean('optional').notNull().default(false),
}, (t) => ({
  idxService: index('idx_service_components_service').on(t.serviceId),
}));

/**
 * Prestación efectivamente realizada en una visita. Es la referencia única
 * que enlaza la atención con su línea de cobro y su movimiento de stock:
 * sin ella, el formulario general de facturación no puede saber que esa
 * atención ya se contabilizó y terminaría cobrándola otra vez.
 */
export const visitServiceItems = pgTable('visit_service_items', {
  id: serial('id').primaryKey(),
  appointmentId: integer('appointment_id').notNull().references(() => appointments.id, { onDelete: 'cascade' }),
  serviceId: integer('service_id').notNull().references(() => services.id),
  medicalRecordId: integer('medical_record_id').references(() => medicalRecords.id, { onDelete: 'set null' }),
  invoiceId: integer('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
  invoiceItemId: integer('invoice_item_id').references(() => invoiceItems.id, { onDelete: 'set null' }),
  quantity: decimal('quantity', { precision: 12, scale: 3 }).notNull(),
  // Fotografía del nombre y el precio al momento de realizarla: cambiar la
  // tarifa mañana no puede alterar lo que se cobró hoy.
  descriptionSnapshot: varchar('description_snapshot', { length: 255 }).notNull(),
  unitPriceSnapshot: decimal('unit_price_snapshot', { precision: 12, scale: 2 }).notNull(),
  // Identificador de la operación que la creó. Junto con el índice único
  // hace que reenviar la misma operación no genere una segunda línea.
  operationId: varchar('operation_id', { length: 36 }),
  status: varchar('status', { length: 20 }).notNull().default('realizada'),
  /** Línea que revierte a otra; una corrección compensa, no borra. */
  reversesItemId: integer('reverses_item_id'),
  createdBy: varchar('created_by', { length: 36 }).notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  uqOperationService: uniqueIndex('uq_visit_service_operation').on(t.operationId, t.serviceId),
  idxAppointment: index('idx_visit_service_appointment').on(t.appointmentId),
  idxInvoice: index('idx_visit_service_invoice').on(t.invoiceId),
}));

export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
export type ServiceComponent = typeof serviceComponents.$inferSelect;
export type VisitServiceItem = typeof visitServiceItems.$inferSelect;

/**
 * Prestaciones previstas para una cita. Sirven para una sola cosa:
 * preparar el botiquín antes de salir. Planificar no es realizar — no
 * emite cobro, no descuenta stock y no aparece en la ficha. Lo realizado
 * vive en `visit_service_items`, y solo se escribe al confirmar la visita.
 */
export const appointmentPlannedServices = pgTable('appointment_planned_services', {
  id: serial('id').primaryKey(),
  appointmentId: integer('appointment_id').notNull().references(() => appointments.id, { onDelete: 'cascade' }),
  serviceId: integer('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  quantity: decimal('quantity', { precision: 12, scale: 3 }).notNull().default('1'),
  createdBy: varchar('created_by', { length: 36 }).references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  uqAppointmentService: uniqueIndex('uq_planned_service').on(t.appointmentId, t.serviceId),
}));

export type AppointmentPlannedService = typeof appointmentPlannedServices.$inferSelect;
