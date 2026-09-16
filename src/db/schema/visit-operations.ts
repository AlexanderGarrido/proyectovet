import { pgTable, varchar, jsonb, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users';
import type { VisitResult } from '../../lib/visit-types';

export const visitOperations = pgTable('visit_operations', {
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  operationId: varchar('operation_id', { length: 36 }).notNull(),
  payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
  result: jsonb('result').$type<VisitResult>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.operationId] })]);
