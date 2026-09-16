import { describe, expect, it } from 'vitest';
import { clinicDay, clinicDayRange, fromClinicInput, toClinicInput } from './clinic-time';
describe('Jornada en Santiago', () => {
  it('no cambia al día UTC antes de medianoche local', () => { expect(clinicDay(new Date('2026-09-17T01:30:00Z'))).toBe('2026-09-16'); });
  it('convierte formularios locales de invierno y verano sin depender del host', () => {
    expect(fromClinicInput('2026-07-01T10:30')).toBe('2026-07-01T14:30:00.000Z');
    expect(fromClinicInput('2026-09-16T10:30')).toBe('2026-09-16T13:30:00.000Z');
    expect(toClinicInput('2026-09-16T13:30:00Z')).toBe('2026-09-16T10:30');
  });
  it('usa límites locales y admite el salto de medianoche', () => {
    const { start, end } = clinicDayRange('2026-09-06');
    expect(clinicDay(start)).toBe('2026-09-06');
    expect(clinicDay(new Date(end.getTime() - 1))).toBe('2026-09-06');
    expect(end.getTime() - start.getTime()).toBe(23 * 3600000);
  });
  it('rechaza horas inexistentes y entradas inválidas', () => {
    expect(() => fromClinicInput('2026-09-06T00:30')).toThrow();
    expect(() => fromClinicInput('hoy')).toThrow();
    expect(() => clinicDayRange('2026-02-31')).toThrow();
  });
});
