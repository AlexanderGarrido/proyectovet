import { and, desc, eq, inArray, lte } from 'drizzle-orm';
import { db } from '../db';
import { appointments } from '../db/schema/appointments';
import { medicalRecords, vaccines } from '../db/schema/medical';
import { prescriptions, labOrders } from '../db/schema/prescriptions';
import { consentForms } from '../db/schema/consents';
import { invoices } from '../db/schema/billing';
import { communicationEvents } from '../db/schema/followups';
import { users } from '../db/schema/users';

export const TIMELINE_KINDS = ['consulta', 'cita', 'vacuna', 'receta', 'laboratorio', 'documento', 'cobro', 'comunicacion'] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export interface TimelineItem {
  /** Identificador estable "tipo:id": la paginación no puede depender del índice. */
  key: string;
  kind: TimelineKind;
  id: number;
  /** Instante ISO; para fuentes con fecha sin hora se usa el mediodía local. */
  at: string;
  title: string;
  detail?: string | null;
  author?: string | null;
  href?: string;
  /** Esta nota corrige a otra anterior. */
  amendsRecordId?: number | null;
}

/** Qué puede ver cada rol. Se aplica en el servidor, nunca en el cliente. */
export function allowedKinds(role: string): TimelineKind[] {
  if (role === 'admin' || role === 'veterinario') return [...TIMELINE_KINDS];
  // Recepción coordina y cobra; no lee la nota clínica ni sus documentos.
  if (role === 'recepcionista') return ['cita', 'vacuna', 'cobro', 'comunicacion'];
  return [];
}

/**
 * Las fechas `date` de Postgres llegan como "YYYY-MM-DD". Ordenarlas junto
 * a timestamps exige un instante: se usa el mediodía para que el elemento
 * caiga en su propio día en cualquier huso razonable, y se deja constancia
 * de que la hora no es un dato real.
 */
const atNoon = (day: string) => `${day}T12:00:00.000Z`;

export interface TimelinePage {
  items: TimelineItem[];
  /** Cursor opaco para la página siguiente; ausente = no hay más. */
  nextCursor?: string;
  kinds: TimelineKind[];
}

/**
 * Cronología del paciente: reúne consultas, citas, vacunas, recetas,
 * laboratorio, consentimientos, cobros y comunicaciones en una sola lista.
 * Hasta ahora cada fuente vivía en su pestaña, así que reconstruir "qué le
 * pasó a este paciente" obligaba a saltar entre cinco vistas y comparar
 * fechas a mano.
 *
 * Paginación por cursor `at|key` en orden descendente: el orden es estable
 * aunque dos elementos compartan fecha, y una inserción concurrente no
 * desplaza la página siguiente como haría un OFFSET.
 */
export async function loadTimeline(
  patientId: number,
  role: string,
  options: { limit?: number; cursor?: string; kinds?: TimelineKind[] } = {}
): Promise<TimelinePage> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 25));
  const permitted = allowedKinds(role);
  const kinds = options.kinds?.length ? options.kinds.filter((k) => permitted.includes(k)) : permitted;
  if (!kinds.length) return { items: [], kinds: [] };

  const want = (kind: TimelineKind) => kinds.includes(kind);
  // Cada fuente aporta como máximo `limit + 1` elementos anteriores al
  // cursor; la mezcla posterior recorta al tamaño real de la página.
  // Los elementos que empatan en instante con el cursor se vuelven a leer
  // y se descartan en memoria, así que el cupo por fuente se amplía para
  // que esos repetidos no consuman la página.
  const window = (limit + 1) * 2;
  const [cursorAt, cursorKey] = options.cursor ? splitCursor(options.cursor) : [null, null];
  const cursorDate = cursorAt ? new Date(cursorAt) : null;

  const [records, appts, vaccineRows, prescriptionRows, labRows, consentRows, invoiceRows, commRows] = await Promise.all([
    want('consulta')
      ? db.select({
          id: medicalRecords.id, at: medicalRecords.date, reason: medicalRecords.reason,
          diagnosis: medicalRecords.diagnosis, treatment: medicalRecords.treatment,
          amends: medicalRecords.amendsRecordId, author: users.name,
        }).from(medicalRecords).leftJoin(users, eq(medicalRecords.veterinarianId, users.id))
        .where(and(eq(medicalRecords.patientId, patientId), cursorDate ? lte(medicalRecords.date, cursorDate) : undefined))
        .orderBy(desc(medicalRecords.date), desc(medicalRecords.id)).limit(window)
      : [],
    want('cita')
      ? db.select({
          id: appointments.id, at: appointments.scheduledAt, type: appointments.type,
          status: appointments.status, reason: appointments.reason, author: users.name,
        }).from(appointments).leftJoin(users, eq(appointments.veterinarianId, users.id))
        .where(and(eq(appointments.patientId, patientId), cursorDate ? lte(appointments.scheduledAt, cursorDate) : undefined))
        .orderBy(desc(appointments.scheduledAt), desc(appointments.id)).limit(window)
      : [],
    want('vacuna')
      ? db.select({ id: vaccines.id, day: vaccines.applicationDate, name: vaccines.name, next: vaccines.nextDoseDate, author: users.name })
        .from(vaccines).leftJoin(users, eq(vaccines.veterinarianId, users.id))
        // La vacuna solo tiene día, no hora; como en el resto de las
        // fuentes, el corte fino lo hace el cursor en memoria.
        .where(and(eq(vaccines.patientId, patientId), cursorAt ? lte(vaccines.applicationDate, cursorAt.slice(0, 10)) : undefined))
        .orderBy(desc(vaccines.applicationDate), desc(vaccines.id)).limit(window)
      : [],
    want('receta')
      ? db.select({ id: prescriptions.id, at: prescriptions.date, notes: prescriptions.notes, author: users.name })
        .from(prescriptions).leftJoin(users, eq(prescriptions.veterinarianId, users.id))
        .where(and(eq(prescriptions.patientId, patientId), cursorDate ? lte(prescriptions.date, cursorDate) : undefined))
        .orderBy(desc(prescriptions.date), desc(prescriptions.id)).limit(window)
      : [],
    want('laboratorio')
      ? db.select({ id: labOrders.id, at: labOrders.requestedAt, type: labOrders.type, status: labOrders.status, results: labOrders.results, author: users.name })
        .from(labOrders).leftJoin(users, eq(labOrders.veterinarianId, users.id))
        .where(and(eq(labOrders.patientId, patientId), cursorDate ? lte(labOrders.requestedAt, cursorDate) : undefined))
        .orderBy(desc(labOrders.requestedAt), desc(labOrders.id)).limit(window)
      : [],
    want('documento')
      ? db.select({ id: consentForms.id, at: consentForms.createdAt, type: consentForms.type, signedBy: consentForms.signedByName })
        .from(consentForms).where(and(eq(consentForms.patientId, patientId), cursorDate ? lte(consentForms.createdAt, cursorDate) : undefined))
        .orderBy(desc(consentForms.createdAt), desc(consentForms.id)).limit(window)
      : [],
    want('cobro') ? loadPatientInvoices(patientId, cursorAt, window) : [],
    want('comunicacion')
      ? db.select({ id: communicationEvents.id, at: communicationEvents.createdAt, channel: communicationEvents.channel, status: communicationEvents.status, summary: communicationEvents.summary, author: users.name })
        .from(communicationEvents).leftJoin(users, eq(communicationEvents.createdBy, users.id))
        .where(and(eq(communicationEvents.patientId, patientId), cursorDate ? lte(communicationEvents.createdAt, cursorDate) : undefined))
        .orderBy(desc(communicationEvents.createdAt), desc(communicationEvents.id)).limit(window)
      : [],
  ]);

  const items: TimelineItem[] = [
    ...records.map((r) => ({
      key: `consulta:${r.id}`, kind: 'consulta' as const, id: r.id, at: new Date(r.at).toISOString(),
      title: r.amends ? `Adenda a la consulta #${r.amends}` : r.reason,
      detail: r.diagnosis || r.treatment || null, author: r.author, href: `/historial/${r.id}`, amendsRecordId: r.amends,
    })),
    ...appts.map((a) => ({
      key: `cita:${a.id}`, kind: 'cita' as const, id: a.id, at: new Date(a.at).toISOString(),
      title: `Cita ${a.type}`, detail: a.reason ? `${a.status} · ${a.reason}` : a.status, author: a.author, href: `/citas/${a.id}`,
    })),
    ...vaccineRows.map((v) => ({
      key: `vacuna:${v.id}`, kind: 'vacuna' as const, id: v.id, at: atNoon(String(v.day)),
      title: `Vacuna ${v.name}`, detail: v.next ? `Próxima dosis: ${v.next}` : 'Sin próxima dosis registrada', author: v.author,
    })),
    ...prescriptionRows.map((p) => ({
      key: `receta:${p.id}`, kind: 'receta' as const, id: p.id, at: new Date(p.at).toISOString(),
      title: 'Receta emitida', detail: p.notes, author: p.author, href: `/recetas/${p.id}`,
    })),
    ...labRows.map((l) => ({
      key: `laboratorio:${l.id}`, kind: 'laboratorio' as const, id: l.id, at: new Date(l.at).toISOString(),
      // El resultado importa tanto como la solicitud: sin esto la lista no
      // distingue un examen pedido de uno que ya tiene informe cargado.
      title: `Laboratorio · ${l.type}`, detail: `${l.status}${l.results ? ' · con resultado' : ' · sin resultado'}`, author: l.author, href: '/ordenes',
    })),
    ...consentRows.map((c) => ({
      key: `documento:${c.id}`, kind: 'documento' as const, id: c.id, at: new Date(c.at).toISOString(),
      title: `Consentimiento ${c.type}`, detail: c.signedBy ? `Firmado por ${c.signedBy}` : 'Sin firma registrada', href: '/consentimientos',
    })),
    ...invoiceRows,
    ...commRows.map((c) => ({
      key: `comunicacion:${c.id}`, kind: 'comunicacion' as const, id: c.id, at: new Date(c.at).toISOString(),
      title: `Comunicación por ${c.channel}`, detail: `${communicationStatusLabel(c.status)}${c.summary ? ` · ${c.summary}` : ''}`, author: c.author,
    })),
  ];

  return { ...paginateTimeline(items, limit, options.cursor), kinds };
}

/**
 * Mezcla, ordena y recorta los elementos de todas las fuentes.
 *
 * El orden es fecha descendente y, a igual fecha, la clave `tipo:id`. Sin
 * ese segundo criterio dos elementos del mismo instante podrían
 * intercambiarse entre una página y la siguiente: uno aparecería dos veces
 * y el otro desaparecería sin que nadie lo note.
 */
export function paginateTimeline(items: TimelineItem[], limit: number, cursor?: string): { items: TimelineItem[]; nextCursor?: string } {
  const [cursorAt, cursorKey] = cursor ? splitCursor(cursor) : [null, null];
  const sorted = [...items].sort((a, b) => (a.at === b.at ? (a.key < b.key ? 1 : -1) : a.at < b.at ? 1 : -1));
  const afterCursor = cursorAt && cursorKey
    ? sorted.filter((item) => item.at < cursorAt || (item.at === cursorAt && item.key < cursorKey))
    : sorted;
  const page = afterCursor.slice(0, limit);
  const last = page.at(-1);
  const hasMore = afterCursor.length > limit;
  return { items: page, nextCursor: hasMore && last ? `${last.at}|${last.key}` : undefined };
}

function splitCursor(cursor: string): [string | null, string | null] {
  const index = cursor.indexOf('|');
  if (index < 0) return [null, null];
  const at = cursor.slice(0, index);
  return Number.isFinite(Date.parse(at)) ? [at, cursor.slice(index + 1)] : [null, null];
}

function communicationStatusLabel(status: string): string {
  return { preparado: 'Preparado', enviado_manual: 'Declarado enviado', entregado: 'Entrega acreditada', fallido: 'No se pudo enviar' }[status] ?? status;
}

/**
 * Los cobros cuelgan de la cita, no del paciente, así que se resuelven por
 * sus citas. Un cobro emitido sin cita asociada pertenece al responsable y
 * no a un paciente concreto: no aparece aquí porque atribuirlo a uno sería
 * inventar un vínculo que la base no tiene.
 */
async function loadPatientInvoices(patientId: number, cursorAt: string | null, window: number): Promise<TimelineItem[]> {
  // Orden estable y acotado: con más citas que el tope, se conservan las
  // más recientes, que son las que la cronología muestra primero.
  const patientAppointments = await db.select({ id: appointments.id }).from(appointments)
    .where(eq(appointments.patientId, patientId)).orderBy(desc(appointments.scheduledAt)).limit(500);
  if (!patientAppointments.length) return [];
  const rows = await db.select({ id: invoices.id, at: invoices.date, total: invoices.total, status: invoices.status, number: invoices.invoiceNumber })
    .from(invoices)
    .where(and(inArray(invoices.appointmentId, patientAppointments.map((a) => a.id)), cursorAt ? lte(invoices.date, new Date(cursorAt)) : undefined))
    .orderBy(desc(invoices.date), desc(invoices.id)).limit(window);
  return rows.map((i) => ({
    key: `cobro:${i.id}`, kind: 'cobro' as const, id: i.id, at: new Date(i.at).toISOString(),
    title: `Cobro ${i.number}`, detail: `${i.status} · $${Number(i.total).toLocaleString('es-CL')}`, href: `/facturacion/${i.id}`,
  }));
}
