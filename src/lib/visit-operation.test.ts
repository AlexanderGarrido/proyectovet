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

describe('Formato 2: prestaciones del catálogo', () => {
  it('acepta líneas de prestación con su cantidad y la versión declarada', () => {
    const parsed = visitOperationSchema.safeParse({ ...base, version: 2, occurredAt: '2026-09-16T12:05:00.000Z', items: [{ serviceId: 3, quantity: 2 }] });
    expect(parsed.success).toBe(true);
  });
  it('sigue aceptando el formato anterior, sin versión ni prestaciones', () => {
    // Un dispositivo con cola antigua debe poder vaciarla tras actualizar.
    expect(visitOperationSchema.safeParse({ ...base, charge: { description: 'Atención', amount: 25000 } }).success).toBe(true);
  });
  it('rechaza cobrar por catálogo y por monto libre a la vez', () => {
    const parsed = visitOperationSchema.safeParse({ ...base, items: [{ serviceId: 3, quantity: 1 }], charge: { description: 'Atención', amount: 1000 } });
    expect(parsed.success).toBe(false);
  });
  it('rechaza la misma prestación repetida: la cantidad va en la línea', () => {
    expect(visitOperationSchema.safeParse({ ...base, items: [{ serviceId: 3, quantity: 1 }, { serviceId: 3, quantity: 1 }] }).success).toBe(false);
  });
  it('una atención sin costo no puede traer prestaciones', () => {
    expect(visitOperationSchema.safeParse({ ...base, noCharge: true, items: [{ serviceId: 3, quantity: 1 }] }).success).toBe(false);
  });
  it('iniciar o ir a la visita no registra prestaciones', () => {
    expect(visitOperationSchema.safeParse({ ...base, action: 'start', items: [{ serviceId: 3, quantity: 1 }] }).success).toBe(false);
  });
  it('acepta la plantilla con la que se redactó la nota', () => {
    expect(visitOperationSchema.safeParse({ ...base, record: { reason: 'Control', templateId: 4, templateVersion: 2 } }).success).toBe(true);
  });
});

describe('Adendas sobre una visita cerrada', () => {
  const cerrada = { status: 'completada', updatedAt: base.expectedUpdatedAt };
  const adenda = { ...base, action: 'save' as const, record: { reason: 'Adenda', observations: 'Se corrige la dosis indicada', amendsRecordId: 3 } };

  it('acepta la adenda que declara a qué registro corrige', () => {
    expect(visitOperationSchema.safeParse(adenda).success).toBe(true);
    expect(() => validateVisitChange(adenda, cerrada, true, true)).not.toThrow();
  });

  it('sigue rechazando una nota nueva que no declara corrección', () => {
    // Sin referencia al original sería reabrir la atención por la puerta
    // de atrás, no corregirla.
    expect(() => validateVisitChange({ ...base, action: 'save', record: { reason: 'Otra consulta' } }, cerrada, true, true)).toThrow('adenda');
  });

  it('una adenda no puede descontar insumos', () => {
    const conInsumos = { ...adenda, record: { ...adenda.record, supplies: [{ productId: 1, quantity: 1 }] } };
    expect(() => validateVisitChange(conInsumos, cerrada, true, true)).toThrow('no descuenta insumos');
  });

  it('una visita cerrada tampoco se reabre con "en camino" o "iniciar"', () => {
    expect(() => validateVisitChange({ ...base, action: 'start' }, cerrada, true, true)).toThrow('cerrada');
    expect(() => validateVisitChange({ ...base, action: 'travel' }, cerrada, true, true)).toThrow('cerrada');
  });
});
