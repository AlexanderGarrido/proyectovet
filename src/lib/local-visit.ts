import type { PatientCard, VisitSnapshot } from './visit-types';

/**
 * Visitas creadas sin señal. Viven en la copia local con un id negativo
 * hasta que el servidor confirma la apertura y entrega el número real: los
 * ids reales son siempre positivos, así que no pueden confundirse.
 */
export const localVisitId = (now = Date.now()) => -now;
export const isLocalVisitId = (id: number) => id < 0;

export function visitFromCard(card: PatientCard, id: number, user: { id: string; name: string }, occurredAt: string): VisitSnapshot {
  return {
    id, patientId: card.id, ownerId: card.ownerId, veterinarianId: user.id, veterinarianName: user.name,
    scheduledAt: occurredAt, startedAt: occurredAt, endAt: new Date(Date.parse(occurredAt) + 30 * 60_000).toISOString(),
    completedAt: null, updatedAt: occurredAt, status: 'en_curso', type: 'consulta', origin: 'sin_cita',
    reason: null, notes: null, visitAddress: null, noCharge: false,
    patient: { name: card.name, species: card.species, breed: card.breed, weight: card.weight, notes: card.notes },
    owner: card.owner, records: card.records, invoices: [], vaccines: card.vaccines, alerts: card.alerts,
  };
}
