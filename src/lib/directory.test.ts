import { describe, expect, it, vi } from 'vitest';
vi.mock('../db', () => ({ db: {} }));
import { buildPatientCards } from './directory';

const patient = (id: number) => ({ id, name: `P${id}`, species: 'perro', breed: null, weight: '10.00', notes: null, ownerId: 100 + id, firstName: 'Ana', lastName: 'Rojas', phone: '+569', address: 'Calle 1' });

describe('buildPatientCards', () => {
  it('agrupa alertas, las 3 últimas consultas y las 3 últimas vacunas por paciente', () => {
    const records = [1, 2, 3, 4].map((n) => ({ id: n, patientId: 1, appointmentId: null, date: `2026-09-0${n}T10:00:00.000Z`, reason: `C${n}`, subjective: null, diagnosis: null, treatment: null, observations: null, vitalSigns: null }));
    const vaccines = [1, 2, 3, 4].map((n) => ({ patientId: 1, name: `V${n}`, applicationDate: `2026-08-0${n}`, nextDoseDate: null }));
    const cards = buildPatientCards([patient(1), patient(2)], [{ id: 9, patientId: 1, category: 'alergia', text: 'Penicilina', validUntil: null }], records, vaccines);
    expect(cards[0].owner).toEqual({ firstName: 'Ana', lastName: 'Rojas', phone: '+569', address: 'Calle 1' });
    expect(cards[0].alerts).toEqual([{ id: 9, category: 'alergia', text: 'Penicilina', validUntil: null }]);
    expect(cards[0].records.map((r) => r.reason)).toEqual(['C4', 'C3', 'C2']);
    expect(cards[0].vaccines.map((v) => v.name)).toEqual(['V4', 'V3', 'V2']);
    expect(cards[1]).toMatchObject({ id: 2, alerts: [], records: [], vaccines: [] });
  });
});
