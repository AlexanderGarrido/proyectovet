import { describe, expect, it } from 'vitest';
import { resolveServices, totalCents } from './services';
import { VisitError } from './visit-operation';

/**
 * Transacción simulada: devuelve filas explícitas por consulta, de modo que
 * la prueba describe el estado del catálogo sin depender de una base.
 * `resolveServices` hace dos tipos de lectura — el servicio y sus
 * componentes — y se distinguen por el orden en que las pide.
 */
function tx(services: any[], componentBatches: any[][]) {
  const reads: any[][] = [services, ...componentBatches];
  const chain = () => {
    const query: any = {};
    for (const method of ['from', 'leftJoin', 'where', 'limit']) query[method] = () => query;
    query.then = (resolve: any, reject: any) =>
      Promise.resolve().then(() => (reads.length ? reads.shift() : [])).then(resolve, reject);
    return query;
  };
  return { select: () => chain() };
}

const consulta = { id: 1, name: 'Consulta a domicilio', price: '25000.00', aftercare: 'Controlar temperatura 48 h', isActive: true };
const vacuna = { id: 2, name: 'Vacuna séxtuple', price: '18000.00', aftercare: 'Observar el sitio de aplicación', isActive: true };
const paquete = { id: 3, name: 'Plan cachorro', price: '40000.00', aftercare: null, isActive: true };

describe('Resolución de prestaciones contra el catálogo', () => {
  it('valora con la tarifa del servidor, no con la que envía el cliente', async () => {
    const resolved = await resolveServices(tx([consulta], [[]]) as any, [{ serviceId: 1, quantity: 1 }]);
    expect(resolved[0]).toMatchObject({ serviceId: 1, name: 'Consulta a domicilio', unitPriceCents: 2500000, subtotalCents: 2500000 });
    expect(totalCents(resolved)).toBe(2500000);
  });

  it('multiplica precio e insumos por la cantidad realizada', async () => {
    const components = [[{ serviceId: 2, productId: 10, childServiceId: null, quantity: '1.500', optional: false, aftercare: null }]];
    const resolved = await resolveServices(tx([vacuna], components) as any, [{ serviceId: 2, quantity: 2 }]);
    expect(resolved[0].subtotalCents).toBe(3600000);
    expect(resolved[0].supplies).toEqual([{ productId: 10, quantity: 3 }]);
  });

  it('separa los insumos opcionales de los que se descuentan siempre', async () => {
    const components = [[
      { serviceId: 1, productId: 10, childServiceId: null, quantity: '1', optional: false, aftercare: null },
      { serviceId: 1, productId: 11, childServiceId: null, quantity: '2', optional: true, aftercare: null },
    ]];
    const resolved = await resolveServices(tx([consulta], components) as any, [{ serviceId: 1, quantity: 1 }]);
    expect(resolved[0].supplies).toEqual([{ productId: 10, quantity: 1 }]);
    expect(resolved[0].optionalSupplies).toEqual([{ productId: 11, quantity: 2 }]);
  });

  it('un paquete se cobra a su precio y hereda los insumos de sus componentes', async () => {
    // Cobrar el paquete y además cada prestación hija sería cobrar dos
    // veces el mismo trabajo: solo el paquete aporta línea de cobro.
    const componentBatches = [
      [{ serviceId: 3, productId: null, childServiceId: 2, quantity: '1', optional: false, aftercare: 'Observar el sitio de aplicación' }],
      [{ serviceId: 2, productId: 10, childServiceId: null, quantity: '1', optional: false, aftercare: null }],
    ];
    const resolved = await resolveServices(tx([paquete], componentBatches) as any, [{ serviceId: 3, quantity: 1 }]);
    expect(resolved[0].subtotalCents).toBe(4000000);
    expect(resolved[0].supplies).toEqual([{ productId: 10, quantity: 1 }]);
    expect(resolved[0].aftercare).toContain('Observar el sitio de aplicación');
  });

  it('rechaza una prestación retirada del catálogo en vez de cobrar cero', async () => {
    await expect(resolveServices(tx([], [[]]) as any, [{ serviceId: 99, quantity: 1 }]))
      .rejects.toThrow(VisitError);
  });

  it('no consulta nada cuando la operación no trae prestaciones', async () => {
    expect(await resolveServices(tx([], []) as any, [])).toEqual([]);
  });

  it('un paquete que se contiene a sí mismo no produce expansión infinita', async () => {
    const componentBatches = [
      [{ serviceId: 3, productId: null, childServiceId: 3, quantity: '1', optional: false, aftercare: null }],
      [],
    ];
    const resolved = await resolveServices(tx([paquete], componentBatches) as any, [{ serviceId: 3, quantity: 1 }]);
    expect(resolved[0].supplies).toEqual([]);
  });
});
