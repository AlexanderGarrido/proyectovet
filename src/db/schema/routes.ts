import {
  pgTable,
  varchar,
  integer,
  serial,
  text,
  boolean,
  timestamp,
  date,
  decimal,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { owners } from './patients';

/**
 * Domicilios guardados de un responsable. La cita conserva además su
 * propia `visit_address` como fotografía: si alguien corrige el domicilio
 * el año que viene, las visitas pasadas deben seguir diciendo dónde se
 * atendió realmente.
 */
export const visitAddresses = pgTable('visit_addresses', {
  id: serial('id').primaryKey(),
  ownerId: integer('owner_id').notNull().references(() => owners.id, { onDelete: 'cascade' }),
  label: varchar('label', { length: 80 }),
  address: varchar('address', { length: 500 }).notNull(),
  /** Portón, timbre, estacionamiento, perro suelto en el antejardín. */
  accessNotes: text('access_notes'),
  /** Sector operativo declarado por la clínica, no una comuna oficial. */
  sector: varchar('sector', { length: 80 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idxOwner: index('idx_visit_addresses_owner').on(t.ownerId),
  idxSector: index('idx_visit_addresses_sector').on(t.sector),
}));

/** Jornada de recorrido de un profesional: el contenedor de sus paradas. */
export const routeDays = pgTable('route_days', {
  id: serial('id').primaryKey(),
  veterinarianId: varchar('veterinarian_id', { length: 36 }).notNull().references(() => users.id),
  day: date('day').notNull(),
  notes: text('notes'),
  createdBy: varchar('created_by', { length: 36 }).references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  uqVetDay: uniqueIndex('uq_route_day').on(t.veterinarianId, t.day),
}));

/**
 * Una parada agrupa las citas que ocurren en el mismo domicilio. Agrupar
 * es una decisión explícita del operador: dos pacientes con el mismo
 * apellido no comparten necesariamente casa, y asumirlo mezclaría
 * historias clínicas y cobros de familias distintas.
 */
export const routeStops = pgTable('route_stops', {
  id: serial('id').primaryKey(),
  routeDayId: integer('route_day_id').notNull().references(() => routeDays.id, { onDelete: 'cascade' }),
  visitAddressId: integer('visit_address_id').references(() => visitAddresses.id, { onDelete: 'set null' }),
  /** Dirección efectiva de la parada, congelada al crearla. */
  address: varchar('address', { length: 500 }).notNull(),
  sector: varchar('sector', { length: 80 }),
  position: integer('position').notNull(),
  /** Colchón de traslado declarado a mano; no proviene de ningún proveedor. */
  travelMinutes: integer('travel_minutes').notNull().default(0),
  /**
   * Cobro del traslado. Se atribuye a UNA cita del grupo (`travelChargedTo`)
   * y queda visible allí: repartirlo entre responsables distintos sería
   * cobrarle a alguien por el viaje de otro.
   */
  travelFee: decimal('travel_fee', { precision: 12, scale: 2 }).notNull().default('0'),
  travelChargedTo: integer('travel_charged_to'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idxDay: index('idx_route_stops_day').on(t.routeDayId),
  uqPosition: uniqueIndex('uq_route_stop_position').on(t.routeDayId, t.position),
}));

export type VisitAddress = typeof visitAddresses.$inferSelect;
export type NewVisitAddress = typeof visitAddresses.$inferInsert;
export type RouteDay = typeof routeDays.$inferSelect;
export type RouteStop = typeof routeStops.$inferSelect;
