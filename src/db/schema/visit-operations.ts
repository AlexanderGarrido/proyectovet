import { pgTable, varchar, jsonb, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users';
import type { VisitResult } from '../../lib/visit-types';

export const visitOperations = pgTable('visit_operations', {
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  operationId: varchar('operation_id', { length: 36 }).notNull(),
  payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
  result: jsonb('result').$type<VisitResult>().notNull(),
  // Hora declarada por el dispositivo (puede venir de un reloj desajustado)
  // y hora en que el servidor la aceptó. Se guardan separadas a propósito:
  // un trabajo hecho sin señal a las 10:00 y confirmado a las 18:00 son dos
  // hechos distintos, y solo el segundo es verificable.
  occurredAt: timestamp('occurred_at'),
  receivedAt: timestamp('received_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.operationId] })]);
