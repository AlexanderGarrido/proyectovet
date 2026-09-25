import { describe, expect, it } from 'vitest';
import { isLocalVisitId, localVisitId, visitFromCard } from './local-visit';
import type { PatientCard } from './visit-types';

const card: PatientCard = {
  id: 5, name: 'Toby', species: 'perro', breed: 'Mestizo', weight: '12.00', notes: null, ownerId: 9,
  owner: { firstName: 'Ana', lastName: 'Rojas', phone: '+569', address: 'Calle 1' },
  alerts: [{ id: 1, category: 'alergia', text: 'Penicilina', validUntil: null }],
  records: [], vaccines: [],
};

describe('visita local', () => {
  it('el id provisorio es negativo y no choca con ids reales', () => {
    expect(localVisitId(1727200000000)).toBe(-1727200000000);
    expect(isLocalVisitId(-3)).toBe(true);
    expect(isLocalVisitId(3)).toBe(false);
  });
  it('arma una visita en curso sin cita con los datos de la tarjeta', () => {
    const visit = visitFromCard(card, -7, { id: 'vet-1', name: 'Vet' }, '2026-09-24T14:50:00.000Z');
    expect(visit).toMatchObject({
      id: -7, patientId: 5, ownerId: 9, veterinarianId: 'vet-1', status: 'en_curso', origin: 'sin_cita', type: 'consulta',
      scheduledAt: '2026-09-24T14:50:00.000Z', startedAt: '2026-09-24T14:50:00.000Z', endAt: '2026-09-24T15:20:00.000Z',
      patient: { name: 'Toby', species: 'perro', breed: 'Mestizo', weight: '12.00', notes: null },
      owner: card.owner, alerts: card.alerts, invoices: [],
    });
  });
});
