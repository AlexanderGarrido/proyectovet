import { cn } from '../../lib/utils';
import { chargeTotal, type ChargeTotals } from '../../lib/charge';

export type { ChargeLine, ChargeTotals } from '../../lib/charge';
export { chargeTotal } from '../../lib/charge';

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/**
 * Detalle del cobro, con los mismos componentes y el mismo cálculo en la
 * visita y en el formulario general de facturación. Cuando cada pantalla
 * sumaba por su cuenta, el mismo trabajo podía mostrar dos totales.
 *
 * Los tres estados se distinguen a propósito: «realizada» describe el
 * trabajo, «emitido» que existe un documento de cobro, y «recibido» que
 * entró el dinero. Mezclarlos es lo que hace que una visita atendida
 * parezca pagada.
 */
export function ChargeSummary({ totals, className, footnote }: { totals: ChargeTotals; className?: string; footnote?: string }) {
  const { subtotal, total, balance } = chargeTotal(totals);
  const received = totals.received ?? 0;

  return (
    <div className={cn('rounded-xl border bg-card p-4 text-sm', className)}>
      <table className="w-full">
        <caption className="sr-only">Detalle del cobro</caption>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="pb-1.5 font-medium">Prestación</th>
            <th scope="col" className="pb-1.5 text-right font-medium">Cant.</th>
            <th scope="col" className="pb-1.5 text-right font-medium">Precio</th>
            <th scope="col" className="pb-1.5 text-right font-medium">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {totals.lines.length === 0 && (
            <tr><td colSpan={4} className="py-2 text-muted-foreground">Sin prestaciones registradas todavía.</td></tr>
          )}
          {totals.lines.map((line) => (
            <tr key={line.id} className={cn('border-t', line.performed === false && 'text-muted-foreground line-through')}>
              <td className="py-1.5">{line.description}</td>
              <td className="py-1.5 text-right tabular-nums">{line.quantity}</td>
              <td className="py-1.5 text-right tabular-nums">{money(line.unitPrice)}</td>
              <td className="py-1.5 text-right tabular-nums">{line.performed === false ? '—' : money(line.quantity * line.unitPrice)}</td>
            </tr>
          ))}
          {totals.travel ? (
            <tr className="border-t">
              <td className="py-1.5" colSpan={3}>Traslado a domicilio</td>
              <td className="py-1.5 text-right tabular-nums">{money(totals.travel)}</td>
            </tr>
          ) : null}
          {totals.adjustment ? (
            <tr className="border-t">
              <td className="py-1.5" colSpan={3}>
                Ajuste autorizado{totals.adjustmentReason ? ` · ${totals.adjustmentReason}` : ''}
              </td>
              <td className="py-1.5 text-right tabular-nums">{money(totals.adjustment)}</td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr className="border-t">
            <td className="pt-2" colSpan={3}>Subtotal de prestaciones</td>
            <td className="pt-2 text-right tabular-nums">{money(subtotal)}</td>
          </tr>
          <tr>
            <td className="py-1 font-semibold" colSpan={3}>Total del cobro emitido</td>
            <td className="py-1 text-right font-semibold tabular-nums">{money(total)}</td>
          </tr>
          <tr>
            <td colSpan={3}>Recibido</td>
            <td className="text-right tabular-nums">{money(received)}</td>
          </tr>
          <tr className="border-t">
            <td className="pt-1.5 font-semibold" colSpan={3}>Saldo</td>
            <td className="pt-1.5 text-right font-semibold tabular-nums">{money(balance)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-3 text-xs text-muted-foreground">
        {footnote ?? 'Alma emite un documento interno de cobro. No reemplaza una boleta ni una factura tributaria.'}
      </p>
    </div>
  );
}
