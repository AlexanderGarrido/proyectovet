import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { routeDays, routeStops, visitAddresses } from '../db/schema/routes';
import { appointments } from '../db/schema/appointments';
import { patients, owners } from '../db/schema/patients';
import { clinicDayRange } from './clinic-time';
import { VisitError } from './visit-operation';

export interface RouteStopView {
  id: number;
  position: number;
  address: string;
  sector: string | null;
  travelMinutes: number;
  travelFee: string;
  travelChargedTo: number | null;
  visits: {
    id: number; patientId: number; patientName: string; ownerName: string;
    scheduledAt: string; status: string; reason: string | null;
  }[];
}

export interface RouteDayView {
  day: string;
  veterinarianId: string;
  stops: RouteStopView[];
  /** Citas del día que todavía no pertenecen a ninguna parada. */
  unassigned: RouteStopView['visits'];
}

export async function loadRoute(veterinarianId: string, day: string): Promise<RouteDayView> {
  const { start, end } = clinicDayRange(day);
  const [routeDay] = await db.select().from(routeDays)
    .where(and(eq(routeDays.veterinarianId, veterinarianId), eq(routeDays.day, day)));

  const stops = routeDay
    ? await db.select().from(routeStops).where(eq(routeStops.routeDayId, routeDay.id)).orderBy(asc(routeStops.position))
    : [];

  const visits = await db
    .select({
      id: appointments.id, patientId: appointments.patientId, routeStopId: appointments.routeStopId,
      scheduledAt: appointments.scheduledAt, status: appointments.status, reason: appointments.reason,
      patientName: patients.name, ownerFirst: owners.firstName, ownerLast: owners.lastName,
    })
    .from(appointments)
    .innerJoin(patients, eq(appointments.patientId, patients.id))
    .innerJoin(owners, eq(appointments.ownerId, owners.id))
    .where(and(
      eq(appointments.veterinarianId, veterinarianId),
      sql`${appointments.scheduledAt} >= ${start} AND ${appointments.scheduledAt} < ${end}`,
    ))
    .orderBy(asc(appointments.scheduledAt))
    .limit(150);

  const shape = (rows: typeof visits) => rows.map((v) => ({
    id: v.id, patientId: v.patientId, patientName: v.patientName,
    ownerName: `${v.ownerFirst} ${v.ownerLast}`, scheduledAt: v.scheduledAt.toISOString(),
    status: v.status, reason: v.reason,
  }));

  return {
    day, veterinarianId,
    stops: stops.map((stop) => ({
      id: stop.id, position: stop.position, address: stop.address, sector: stop.sector,
      travelMinutes: stop.travelMinutes, travelFee: stop.travelFee, travelChargedTo: stop.travelChargedTo,
      visits: shape(visits.filter((v) => v.routeStopId === stop.id)),
    })),
    unassigned: shape(visits.filter((v) => !v.routeStopId)),
  };
}

export interface CreateStopInput {
  veterinarianId: string;
  day: string;
  address: string;
  sector?: string | null;
  visitAddressId?: number | null;
  travelMinutes?: number;
  travelFee?: number;
  /** Cita del grupo que asume el traslado; debe estar entre las incluidas. */
  travelChargedTo?: number | null;
  appointmentIds: number[];
  createdBy: string;
}

/**
 * Crea una parada y le asigna las citas indicadas, todo en una sola
 * transacción: una parada a medio armar —con la mitad de las citas
 * movidas— dejaría la agenda diciendo algo que no es cierto.
 *
 * Solo agrupa lo que el operador seleccionó explícitamente. Ninguna regla
 * automática decide que dos pacientes comparten domicilio.
 */
export async function createRouteStop(input: CreateStopInput) {
  if (!input.appointmentIds.length) throw new VisitError(400, 'Selecciona al menos una visita para la parada');
  if (input.travelChargedTo && !input.appointmentIds.includes(input.travelChargedTo)) {
    throw new VisitError(400, 'El traslado debe atribuirse a una de las visitas de la parada');
  }

  return db.transaction(async (tx) => {
    const { start, end } = clinicDayRange(input.day);
    const selected = await tx.select({ id: appointments.id, routeStopId: appointments.routeStopId, scheduledAt: appointments.scheduledAt, veterinarianId: appointments.veterinarianId })
      .from(appointments).where(inArray(appointments.id, input.appointmentIds)).for('update');

    if (selected.length !== input.appointmentIds.length) throw new VisitError(404, 'Alguna de las visitas ya no existe');
    for (const visit of selected) {
      if (visit.veterinarianId !== input.veterinarianId) throw new VisitError(400, 'Todas las visitas de una parada deben ser del mismo profesional');
      if (visit.scheduledAt < start || visit.scheduledAt >= end) throw new VisitError(400, 'Todas las visitas de una parada deben ser del mismo día');
      if (visit.routeStopId) throw new VisitError(409, 'Una de las visitas ya pertenece a otra parada');
    }

    const [day] = await tx.insert(routeDays)
      .values({ veterinarianId: input.veterinarianId, day: input.day, createdBy: input.createdBy })
      .onConflictDoUpdate({ target: [routeDays.veterinarianId, routeDays.day], set: { veterinarianId: input.veterinarianId } })
      .returning();

    const [{ next }] = await tx.select({ next: sql<number>`COALESCE(MAX(${routeStops.position}), 0) + 1` })
      .from(routeStops).where(eq(routeStops.routeDayId, day.id));

    const [stop] = await tx.insert(routeStops).values({
      routeDayId: day.id, visitAddressId: input.visitAddressId ?? null, address: input.address,
      sector: input.sector ?? null, position: next, travelMinutes: input.travelMinutes ?? 0,
      travelFee: (input.travelFee ?? 0).toFixed(2), travelChargedTo: input.travelChargedTo ?? null,
    }).returning();

    // `updatedAt` se conserva a propósito. La comprobación optimista del
    // guardado en terreno compara contra esa marca: si recepción agrupa
    // paradas mientras el veterinario atiende sin señal, tocarla haría
    // rebotar con 409 todos los guardados que él tiene en cola, justo
    // cuando no puede redescargar nada. Asignar una parada es logística,
    // no un cambio del contenido clínico de la visita.
    await tx.update(appointments)
      .set({
        routeStopId: stop.id,
        ...(input.sector !== undefined ? { sector: input.sector } : {}),
        updatedAt: sql`${appointments.updatedAt}`,
      })
      .where(inArray(appointments.id, input.appointmentIds));

    return stop;
  });
}

/**
 * Reordena las paradas de un día. No cambia horarios de citas: mover una
 * cita confirmada sin avisar al responsable no es una decisión que pueda
 * tomar el sistema. El orden es de recorrido, no de agenda.
 */
export async function reorderStops(veterinarianId: string, day: string, orderedIds: number[]) {
  return db.transaction(async (tx) => {
    const [routeDay] = await tx.select().from(routeDays)
      .where(and(eq(routeDays.veterinarianId, veterinarianId), eq(routeDays.day, day)));
    if (!routeDay) throw new VisitError(404, 'No hay recorrido para ese día');

    const existing = await tx.select({ id: routeStops.id }).from(routeStops).where(eq(routeStops.routeDayId, routeDay.id));
    const known = new Set(existing.map((s) => s.id));
    if (orderedIds.length !== known.size || orderedIds.some((id) => !known.has(id))) {
      throw new VisitError(400, 'El nuevo orden debe incluir exactamente las paradas del día');
    }

    // Posiciones temporales negativas: el índice único sobre (día,
    // posición) rechazaría un intercambio directo entre dos paradas.
    for (const [index, id] of orderedIds.entries()) {
      await tx.update(routeStops).set({ position: -(index + 1) }).where(eq(routeStops.id, id));
    }
    for (const [index, id] of orderedIds.entries()) {
      await tx.update(routeStops).set({ position: index + 1 }).where(eq(routeStops.id, id));
    }
    return orderedIds.length;
  });
}

export async function listAddresses(ownerId: number) {
  return db.select().from(visitAddresses)
    .where(and(eq(visitAddresses.ownerId, ownerId), eq(visitAddresses.isActive, true)))
    .orderBy(asc(visitAddresses.label))
    .limit(20);
}
