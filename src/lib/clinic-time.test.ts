import { describe, expect, it } from 'vitest';
import { addClinicDays, clinicDay, clinicDayRange, clinicHhmm, clinicInstant, clinicMinutes, clinicParts, clinicWeekStart, fromClinicInput, toClinicInput } from './clinic-time';
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

describe('Horario de la clínica en la interfaz', () => {
  it('dibuja la grilla con la hora local aunque el dispositivo esté en otra zona', () => {
    // 2026-09-16 13:30Z = 10:30 en Santiago; en UTC+2 el dispositivo diría 15:30.
    expect(clinicHhmm('2026-09-16T13:30:00Z')).toBe('10:30');
    expect(clinicMinutes('2026-09-16T13:30:00Z')).toBe(10 * 60 + 30);
    expect(clinicParts('2026-09-16T13:30:00Z')).toMatchObject({ day: '2026-09-16', hour: 10, minute: 30 });
  });
  it('agrupa una cita nocturna en el día local, no en el día UTC', () => {
    expect(clinicParts('2026-09-17T01:30:00Z')?.day).toBe('2026-09-16');
  });
  it('calcula semanas y desplazamientos sin arrastrar husos', () => {
    expect(clinicWeekStart('2026-09-16')).toBe('2026-09-14'); // miércoles → lunes
    expect(clinicWeekStart('2026-09-14')).toBe('2026-09-14');
    expect(clinicWeekStart('2026-09-20')).toBe('2026-09-14'); // domingo → lunes anterior
    expect(addClinicDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addClinicDays('2026-09-06', -1)).toBe('2026-09-05'); // día con salto de medianoche
  });
  it('convierte una hora local a instante sin depender del host', () => {
    expect(clinicInstant('2026-07-01', '10:30')).toBe('2026-07-01T14:30:00.000Z');
  });
});
