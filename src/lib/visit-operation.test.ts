import { describe, expect, it } from 'vitest';
import { validateVisitChange, visitOperationSchema } from './visit-operation';
import type { VisitOperation } from './visit-types';
const base: VisitOperation = { id: '7f3f63d0-5c8d-4cb9-9bf2-9fbc65d65031', visitId: 1, expectedUpdatedAt: '2026-09-16T10:00:00.000Z', action: 'complete' };
const visit = { status: 'en_curso', updatedAt: base.expectedUpdatedAt };
describe('Cierre de visita', () => {
  it('exige ficha y decisión explícita del cobro', () => {
    expect(() => validateVisitChange(base, visit, false, false)).toThrow('consulta');
    expect(() => validateVisitChange(base, visit, true, false)).toThrow('cobro');
    expect(() => validateVisitChange({ ...base, noCharge: true }, visit, true, false)).not.toThrow();
  });
  it('permite cerrar con saldo y evita volver a facturar', () => {
    expect(() => validateVisitChange(base, visit, true, true)).not.toThrow();
    expect(() => validateVisitChange({ ...base, charge: { description: 'Visita', amount: 100 } }, visit, true, true)).toThrow('ya tiene un cobro');
  });
  it('detecta edición concurrente y visitas canceladas', () => {
    expect(() => validateVisitChange(base, { ...visit, updatedAt: '2026-09-16T11:00:00Z' }, true, true)).toThrow('otro dispositivo');
    expect(() => validateVisitChange(base, { ...visit, status: 'cancelada' }, true, true)).toThrow('cancelada');
  });
  it('una atención cerrada admite pago, pero no otra consulta', () => {
    expect(() => validateVisitChange({ ...base, action: 'save', payment: { amount: 10, method: 'efectivo' } }, { ...visit, status: 'completada' }, true, true)).not.toThrow();
    expect(() => validateVisitChange({ ...base, action: 'save', record: { reason: 'Otra' } }, { ...visit, status: 'completada' }, true, true)).toThrow('cerrada');
  });
  it('valida cantidades, firma de imagen y montos antes de encolar', () => {
    expect(visitOperationSchema.safeParse({ ...base, record: { reason: 'Consulta', supplies: [{ productId: 1, quantity: 0.0001 }] } }).success).toBe(false);
    expect(visitOperationSchema.safeParse({ ...base, noCharge: true, payment: { amount: 10, method: 'efectivo' } }).success).toBe(false);
    expect(visitOperationSchema.safeParse({ ...base, record: { reason: 'Consulta', photos: ['data:image/svg+xml;base64,aaa'] } }).success).toBe(false);
  });
});
