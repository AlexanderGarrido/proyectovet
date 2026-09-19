/**
 * Cálculo del cobro, compartido por la visita y el formulario general de
 * facturación. Vive fuera del componente a propósito: cuando cada pantalla
 * sumaba por su cuenta, el mismo trabajo podía mostrar dos totales, y ese
 * es justamente el tipo de diferencia que nadie nota hasta que el
 * responsable la reclama.
 */
export interface ChargeLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** Una prestación no realizada no se cobra, pero sigue a la vista. */
  performed?: boolean;
}

export interface ChargeTotals {
  lines: ChargeLine[];
  /** Traslado atribuido a esta visita; se muestra aparte, nunca prorrateado. */
  travel?: number;
  /** Ajuste autorizado: negativo descuenta, positivo recarga. */
  adjustment?: number;
  adjustmentReason?: string;
  received?: number;
}

export function chargeTotal(totals: ChargeTotals): { subtotal: number; total: number; balance: number } {
  const subtotal = totals.lines
    .filter((line) => line.performed !== false)
    .reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  // Un ajuste no puede dejar el documento en negativo: eso sería una nota
  // de crédito, que es otro documento con otras reglas.
  const total = Math.max(0, subtotal + (totals.travel ?? 0) + (totals.adjustment ?? 0));
  return { subtotal, total, balance: Math.max(0, total - (totals.received ?? 0)) };
}
