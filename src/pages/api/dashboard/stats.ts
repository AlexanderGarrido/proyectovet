import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { appointments } from '../../../db/schema/appointments';
import { patients, owners } from '../../../db/schema/patients';
import { products } from '../../../db/schema/inventory';
import { invoices } from '../../../db/schema/billing';
import { eq, gte, and, asc, desc, sql, isNotNull } from 'drizzle-orm';

// No migrado a guard.ts a propósito: estas son estadísticas GLOBALES de la
// clínica (próxima cita de cualquiera, stock por vencer, facturas
// pendientes de todos). El permiso genérico 'dashboard:read' también lo
// tiene el tutor (para SU propio portal) — usarlo aquí dejaría pasar a
// cualquier tutor a ver datos operativos de toda la clínica.
const STAFF_ROLES = ['admin', 'veterinario', 'recepcionista'];

export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  if (!STAFF_ROLES.includes(user.role)) {
    return new Response(JSON.stringify({ error: 'Acceso denegado' }), { status: 403 });
  }

  const now = new Date();

  // Next upcoming appointment (not completed/cancelled)
  const [nextAppointment] = await db
    .select({
      id: appointments.id,
      scheduledAt: appointments.scheduledAt,
      type: appointments.type,
      status: appointments.status,
      visitAddress: appointments.visitAddress,
      patientName: patients.name,
      patientSpecies: patients.species,
      ownerFirstName: owners.firstName,
      ownerLastName: owners.lastName,
      ownerPhone: owners.phone,
    })
    .from(appointments)
    .leftJoin(patients, eq(appointments.patientId, patients.id))
    .leftJoin(owners, eq(appointments.ownerId, owners.id))
    .where(
      and(
        gte(appointments.scheduledAt, now),
        sql`${appointments.status} NOT IN ('completada', 'cancelada', 'no_asistio')`
      )
    )
    .orderBy(asc(appointments.scheduledAt))
    .limit(1);

  // Products expiring in the next 30 days
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);
  const expiringProducts = await db
    .select({
      id: products.id,
      name: products.name,
      expirationDate: products.expirationDate,
      stock: products.stock,
      category: products.category,
    })
    .from(products)
    .where(
      and(
        eq(products.isActive, true),
        isNotNull(products.expirationDate),
        sql`${products.expirationDate} <= ${in30Days.toISOString().split('T')[0]}`
      )
    )
    .orderBy(asc(products.expirationDate))
    .limit(10);

  // Pending invoices (borrador, emitida, parcial)
  const pendingInvoices = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      total: invoices.total,
      status: invoices.status,
      date: invoices.date,
      ownerId: invoices.ownerId,
      ownerFirstName: owners.firstName,
      ownerLastName: owners.lastName,
    })
    .from(invoices)
    .leftJoin(owners, eq(invoices.ownerId, owners.id))
    .where(sql`${invoices.status} IN ('borrador', 'emitida', 'parcial')`)
    .orderBy(desc(invoices.date))
    .limit(10);

  return new Response(JSON.stringify({
    nextAppointment: nextAppointment || null,
    expiringProducts,
    pendingInvoices,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
