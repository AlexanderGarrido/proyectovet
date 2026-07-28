import { describe, it, expect } from 'vitest';
import { toCents, fromCents } from './money';

describe('toCents', () => {
  it('convierte strings decimales exactas', () => {
    expect(toCents('1234.56')).toBe(123456);
    expect(toCents('0.10')).toBe(10);
    expect(toCents('100')).toBe(10000);
  });

  it('evita el error clásico de punto flotante (0.1 + 0.2)', () => {
    const sum = toCents('0.10') + toCents('0.20');
    expect(fromCents(sum)).toBe('0.30');
  });

  it('maneja negativos', () => {
    expect(toCents('-50.25')).toBe(-5025);
    expect(fromCents(-5025)).toBe('-50.25');
  });

  it('convierte numbers redondeando a 2 decimales', () => {
    expect(toCents(19.999)).toBe(2000);
  });
});

describe('fromCents', () => {
  it('formatea de vuelta a string decimal', () => {
    expect(fromCents(123456)).toBe('1234.56');
    expect(fromCents(5)).toBe('0.05');
    expect(fromCents(0)).toBe('0.00');
  });
});
