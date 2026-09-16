import { describe, expect, it } from 'vitest';
import { appointmentRequest } from './form-context';
import { appointmentSchema, ownerSchema, ownerFormSchema } from './schemas';
describe('Contratos entre formularios y API', () => {
  it('la cita del formulario se acepta con IDs numéricos y hora local convertida', () => {
    const result = appointmentSchema.parse(appointmentRequest({ patientId: '12', ownerId: '34', veterinarianId: 'vet-1', type: 'control', scheduledAt: '2026-09-16T10:00', endAt: '2026-09-16T10:30' }));
    expect(result.patientId).toBe(12); expect(result.ownerId).toBe(34); expect(result.scheduledAt).toBe('2026-09-16T13:00:00.000Z');
  });
  it('permite registrar responsable de terreno sin correo y sigue rechazando un correo inválido', () => {
    const data = ownerFormSchema.parse({ firstName: 'María', lastName: 'Soto', phone: '+56912345678', email: '' });
    expect(ownerSchema.safeParse(data).success).toBe(true);
    expect(ownerSchema.safeParse({ ...data, email: 'incorrecto' }).success).toBe(false);
  });
});
