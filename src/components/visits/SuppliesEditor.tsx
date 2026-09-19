import type { VisitDraftController } from './useVisitDraft';
import type { VisitLocation, VisitProduct } from '../../lib/visit-types';

const field = 'w-full rounded-lg border bg-background px-3 py-2.5 text-base sm:text-sm';

/**
 * Insumos consumidos en la visita. El stock que se muestra viene de la
 * copia descargada y es informativo: el descuento ocurre cuando el
 * servidor confirma la operación, así que nada aquí reserva existencias.
 */
export function SuppliesEditor({ controller, products, locations }: {
  controller: VisitDraftController;
  products: VisitProduct[];
  locations: VisitLocation[];
}) {
  const { draft, update } = controller;

  const stockOf = (productId: number, locationId: number | null) => {
    if (locationId) return locations.find((l) => l.id === locationId)?.stocks.find((s) => s.productId === productId)?.stock ?? '0';
    return products.find((p) => p.id === productId)?.stock ?? '0';
  };

  const setSupply = (index: number, patch: Partial<VisitDraftController['draft']['supplies'][number]>) =>
    update('supplies', draft.supplies.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Insumos utilizados</h4>
        <button
          type="button" className="min-h-11 text-sm text-primary"
          onClick={() => update('supplies', [...draft.supplies, { productId: products[0]?.id || 0, quantity: 1, locationId: locations[0]?.id ?? null }])}
        >
          + Agregar
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        El stock se descuenta cuando el servidor confirma el guardado; la cantidad mostrada es la de la copia descargada.
      </p>

      {draft.supplies.map((supply, i) => {
        const product = products.find((p) => p.id === supply.productId);
        const available = Number(stockOf(supply.productId, supply.locationId));
        const short = Number.isFinite(available) && supply.quantity > available;
        return (
          <div className="mt-3 rounded-lg border p-3" key={i}>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm">
                Insumo
                <select className={`${field} mt-1`} value={supply.productId} onChange={(e) => setSupply(i, { productId: Number(e.target.value) })}>
                  {products.map((p) => (
                    <option value={p.id} key={p.id}>{p.name} · {stockOf(p.id, supply.locationId)} {p.unit}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Cantidad{product ? ` (${product.unit})` : ''}
                <input
                  className={`${field} mt-1`} type="number" min="0.001" step="0.001" value={supply.quantity}
                  onChange={(e) => setSupply(i, { quantity: Number(e.target.value) })}
                />
              </label>
              <label className="text-sm">
                Botiquín
                <select className={`${field} mt-1`} value={supply.locationId ?? ''} onChange={(e) => setSupply(i, { locationId: Number(e.target.value) || null })}>
                  <option value="">Stock sin asignar</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
              <div className="flex items-end">
                <button type="button" className="min-h-11 text-sm text-destructive" onClick={() => update('supplies', draft.supplies.filter((_, j) => j !== i))}>
                  Quitar insumo
                </button>
              </div>
            </div>
            {short && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                La copia descargada registra {available} disponible(s). Si el servidor no tiene existencias suficientes, el guardado quedará pendiente de revisión.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
