/**
 * Aritmética de dinero sin errores de precisión de punto flotante.
 *
 * Las columnas `decimal` de Postgres llegan como string ("1234.50"). Sumarlas
 * con `parseFloat` puede arrastrar imprecisión binaria (0.1 + 0.2 !== 0.3) —
 * poco probable que se note con montos grandes, pero es la clase de bug que
 * un día deja una factura "pagada" con $0.01 de diferencia. Se trabaja en
 * centavos enteros y se convierte de vuelta solo al guardar/mostrar.
 */
export function toCents(value: string | number): number {
  const str = typeof value === 'number' ? value.toFixed(2) : value;
  const negative = str.trim().startsWith('-');
  const [wholeRaw, decimalRaw = ''] = str.replace('-', '').split('.');
  const whole = Number(wholeRaw || '0');
  const cents = Number((decimalRaw + '00').slice(0, 2));
  const total = whole * 100 + cents;
  return negative ? -total : total;
}

export function fromCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.round(Math.abs(cents));
  const whole = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${negative ? '-' : ''}${whole}.${String(rem).padStart(2, '0')}`;
}
