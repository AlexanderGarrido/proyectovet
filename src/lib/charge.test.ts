import { describe, expect, it } from 'vitest';
import { chargeTotal, type ChargeTotals } from './charge';
import { computeKitLines } from './kit';

const line = (id: string, quantity: number, unitPrice: number, performed?: boolean) => ({ id, description: id, quantity, unitPrice, performed });

describe('Cálculo único del cobro (visita y facturación general)', () => {
  it('suma prestaciones, traslado y ajuste autorizado por separado', () => {
    const totals: ChargeTotals = { lines: [line('consulta', 1, 25000), line('vacuna', 2, 18000)], travel: 5000, adjustment: -3000, received: 20000 };
    expect(chargeTotal(totals)).toEqual({ subtotal: 61000, total: 63000, balance: 43000 });
  });

  it('una prestación no realizada no se cobra aunque siga a la vista', () => {
    const totals: ChargeTotals = { lines: [line('consulta', 1, 25000), line('vacuna', 1, 18000, false)] };
    expect(chargeTotal(totals).total).toBe(25000);
  });

  it('un descuento mayor que el trabajo no deja el documento en negativo', () => {
    expect(chargeTotal({ lines: [line('consulta', 1, 10000)], adjustment: -50000 }).total).toBe(0);
  });

  it('cobro emitido y pago recibido son cifras distintas', () => {
    const totals: ChargeTotals = { lines: [line('consulta', 1, 30000)], received: 30000 };
    const { total, balance } = chargeTotal(totals);
    expect(total).toBe(30000);
    expect(balance).toBe(0);
    // Un pago mayor al total no genera saldo negativo: sería un vuelto,
    // no un saldo a favor registrado en este documento.
    expect(chargeTotal({ ...totals, received: 50000 }).balance).toBe(0);
  });
});

describe('Faltantes del botiquín', () => {
  const productos = [
    { id: 1, name: 'Vacuna séxtuple', unit: 'dosis', minStock: '2', stock: '10' },
    { id: 2, name: 'Suero', unit: 'ml', minStock: '100', stock: '500' },
    { id: 3, name: 'Jeringa', unit: 'unidad', minStock: '10', stock: '50' },
  ];

  it('marca como faltante lo que exige el plan aunque el mínimo esté cubierto', () => {
    const lines = computeKitLines(productos, new Map([[1, 3], [2, 200], [3, 20]]), new Map([[1, 6]]), true);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ productId: 1, available: 3, planned: 6, missing: 3, reason: 'plan' });
  });

  it('distingue el faltante por mínimo del que exige el plan del día', () => {
    const lines = computeKitLines(productos, new Map([[1, 0], [2, 50], [3, 20]]), new Map([[1, 4]]), true);
    expect(lines.map((l) => l.reason)).toEqual(['ambos', 'minimo']);
    expect(lines[0].productId).toBe(1);
  });

  it('sin botiquín asignado usa el stock general en vez de mostrar que falta todo', () => {
    expect(computeKitLines(productos, new Map(), new Map(), false)).toEqual([]);
    expect(computeKitLines(productos, new Map(), new Map(), true)).toHaveLength(3);
  });

  it('no reporta faltantes cuando lo disponible cubre mínimo y plan', () => {
    expect(computeKitLines(productos, new Map([[1, 10], [2, 500], [3, 50]]), new Map([[1, 2]]), true)).toEqual([]);
  });

  it('conserva tres decimales, igual que el stock fraccionario', () => {
    const [linea] = computeKitLines([{ id: 9, name: 'Anestésico', unit: 'ml', minStock: '0', stock: '0' }], new Map([[9, 1.25]]), new Map([[9, 2.5]]), true);
    expect(linea.missing).toBe(1.25);
  });
});
