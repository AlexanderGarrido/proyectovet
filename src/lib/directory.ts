import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { patients, owners } from '../db/schema/patients';
import { patientAlerts } from '../db/schema/clinical';
import { medicalRecords, vaccines } from '../db/schema/medical';
import { clinicDay } from './clinic-time';
import { DAY_LIMITS, type PatientCard, type VisitRecord } from './visit-types';

type PatientRow = { id: number; name: string; species: string; breed: string | null; weight: string | null; notes: string | null; ownerId: number; firstName: string; lastName: string; phone: string | null; address: string | null };
type AlertRow = { id: number; patientId: number; category: string; text: string; validUntil: string | null };
type VaccineRow = { patientId: number; name: string; applicationDate: string; nextDoseDate: string | null };

const newestFirst = <T>(rows: T[], key: (row: T) => string) => [...rows].sort((a, b) => key(b).localeCompare(key(a)));

/** Arma las tarjetas a partir de filas ya leídas. Pura, para poder probarla sin base. */
export function buildPatientCards(rows: PatientRow[], alerts: AlertRow[], records: VisitRecord[], vaccineRows: VaccineRow[]): PatientCard[] {
  const limit = DAY_LIMITS.directoryRecords;
  return rows.map((p) => ({
    id: p.id, name: p.name, species: p.species, breed: p.breed, weight: p.weight, notes: p.notes, ownerId: p.ownerId,
    owner: { firstName: p.firstName, lastName: p.lastName, phone: p.phone, address: p.address },
    alerts: alerts.filter((a) => a.patientId === p.id).map(({ id, category, text, validUntil }) => ({ id, category, text, validUntil })),
    records: newestFirst(records.filter((r) => r.patientId === p.id), (r) => String(r.date)).slice(0, limit),
    vaccines: newestFirst(vaccineRows.filter((v) => v.patientId === p.id), (v) => v.applicationDate).slice(0, limit)
      .map(({ name, applicationDate, nextDoseDate }) => ({ name, applicationDate, nextDoseDate })),
  }));
}

/**
 * Directorio de pacientes activos para atender sin cita y sin señal. Las
 * consultas y vacunas se limitan en la base con row_number(): traer todo el
 * historial de la clínica para quedarse con tres por paciente sería leer
 * cientos de veces más de lo necesario.
 */
export async function loadDirectory(): Promise<{ cards: PatientCard[]; truncated: boolean }> {
  const limit = DAY_LIMITS.directory;
  const rows = await db.select({
    id: patients.id, name: patients.name, species: patients.species, breed: patients.breed, weight: patients.weight, notes: patients.notes,
    ownerId: patients.ownerId, firstName: owners.firstName, lastName: owners.lastName, phone: owners.phone, address: owners.address,
  }).from(patients).innerJoin(owners, eq(patients.ownerId, owners.id))
    .where(eq(patients.isActive, true)).orderBy(asc(patients.name)).limit(limit + 1);
  const truncated = rows.length > limit;
  const kept = rows.slice(0, limit);
  if (!kept.length) return { cards: [], truncated };

  const rankedRecords = db.select({
    id: medicalRecords.id, appointmentId: medicalRecords.appointmentId, patientId: medicalRecords.patientId, date: medicalRecords.date,
    reason: medicalRecords.reason, subjective: medicalRecords.subjective, diagnosis: medicalRecords.diagnosis,
    treatment: medicalRecords.treatment, observations: medicalRecords.observations, vitalSigns: medicalRecords.vitalSigns,
    rank: sql<number>`row_number() over (partition by ${medicalRecords.patientId} order by ${medicalRecords.date} desc)`.as('rank'),
  }).from(medicalRecords).as('ranked_records');
  const rankedVaccines = db.select({
    patientId: vaccines.patientId, name: vaccines.name, applicationDate: vaccines.applicationDate, nextDoseDate: vaccines.nextDoseDate,
    rank: sql<number>`row_number() over (partition by ${vaccines.patientId} order by ${vaccines.applicationDate} desc)`.as('rank'),
  }).from(vaccines).as('ranked_vaccines');

  // `today` es texto (AAAA-MM-DD), no un Date: se puede interpolar tal cual.
  const today = clinicDay();
  const [alerts, records, vaccineRows] = await Promise.all([
    db.select({ id: patientAlerts.id, patientId: patientAlerts.patientId, category: patientAlerts.category, text: patientAlerts.text, validUntil: patientAlerts.validUntil })
      .from(patientAlerts)
      .where(and(isNull(patientAlerts.resolvedAt), or(isNull(patientAlerts.validUntil), sql`${patientAlerts.validUntil} >= ${today}`))),
    db.select().from(rankedRecords).where(sql`${rankedRecords.rank} <= ${DAY_LIMITS.directoryRecords}`),
    db.select().from(rankedVaccines).where(sql`${rankedVaccines.rank} <= ${DAY_LIMITS.directoryRecords}`),
  ]);
  const ids = new Set(kept.map((p) => p.id));
  const cards = buildPatientCards(
    kept,
    alerts.filter((a) => ids.has(a.patientId)),
    records.filter((r) => ids.has(r.patientId)).map(({ rank, ...r }) => ({ ...r, date: new Date(r.date).toISOString() })) as VisitRecord[],
    vaccineRows.filter((v) => ids.has(v.patientId)).map(({ rank, ...v }) => v),
  );
  return { cards, truncated };
}
