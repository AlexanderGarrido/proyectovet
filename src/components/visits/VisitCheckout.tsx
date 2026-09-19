import { useEffect, useState } from 'react';
import type { VisitDraftController } from './useVisitDraft';
import { ChargeSummary, type ChargeLine } from '../billing/ChargeSummary';
import { features } from '../../lib/features';

const field = 'w-full rounded-lg border bg-background px-3 py-2.5 text-base sm:text-sm';
const money = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

export interface CatalogService {
  id: number; name: string; price: string; durationMinutes: number | null;
  aftercare: string | null; isPackage: boolean;
  components: { productId: number | null; productName: string | null; productUnit: string | null; quantity: string; optional: boolean }[];
}

/**
 * Cobro y cierre. La pantalla presenta una propuesta editable y solo al
 * confirmar se aplican efectos: seleccionar una prestación no mueve stock
 * ni emite un cobro. El importe definitivo lo calcula el servidor con la
 * tarifa vigente; lo que se ve aquí es una estimación con los precios que
 * trajo la última carga del catálogo, y la diferencia se declara en vez de
 * aplicarse en silencio.
 */
export function VisitCheckout({ controller }: { controller: VisitDraftController }) {
  const { draft, update, setDraft, invoice, balance, busy, pending, pendingStatus, ownRecords, clinicalChanged, context } = controller;
  const { catalog, state } = useCatalog();
  const disabled = busy || (!!pending && !pendingStatus);

  const selected = draft.items
    .map((item) => ({ item, service: catalog.find((s) => s.id === item.serviceId) }))
    .filter((pair): pair is { item: typeof pair.item; service: CatalogService } => Boolean(pair.service));

  const lines: ChargeLine[] = selected.map(({ item, service }) => ({
    id: String(service.id), description: service.name, quantity: item.quantity,
    unitPrice: Number(service.price), performed: item.performed,
  }));

  function toggleService(service: CatalogService) {
    const exists = draft.items.find((i) => i.serviceId === service.id);
    update('items', exists
      ? draft.items.filter((i) => i.serviceId !== service.id)
      : [...draft.items, { serviceId: service.id, quantity: 1, performed: true }]);
  }

  function patchItem(serviceId: number, patch: Partial<{ quantity: number; performed: boolean }>) {
    update('items', draft.items.map((i) => (i.serviceId === serviceId ? { ...i, ...patch } : i)));
  }

  return (
    <section className="space-y-5 rounded-xl border bg-card p-5 print:hidden">
      <h3 className="text-lg font-semibold">Cobro y cierre</h3>

      <fieldset disabled={disabled} className="space-y-4">
        {invoice ? (
          <div className="rounded-lg bg-muted p-4">
            <p>Total emitido: {money(Number(invoice.total))} · Recibido: {money(invoice.paid)}</p>
            <p className="mt-1 text-lg font-semibold">Saldo: {money(balance)}</p>
            <a className="text-sm text-primary" href={`/facturacion/${invoice.id}`}>Ver detalle del cobro</a>
            <p className="mt-2 text-xs text-muted-foreground">
              Esta visita ya tiene un cobro emitido. Para corregirlo se registra un movimiento compensatorio desde facturación; no se reescribe el original.
            </p>
          </div>
        ) : (
          <>
            {/* ── Prestaciones del catálogo: una selección, un solo efecto. */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-medium">Prestaciones realizadas</h4>
                {state === 'error' && <span className="text-xs text-muted-foreground">No se pudo cargar el catálogo; puedes cobrar con un monto libre.</span>}
                {state === 'sin-conexion' && <span className="text-xs text-muted-foreground">Sin conexión: el catálogo no está disponible en esta copia.</span>}
              </div>

              {catalog.length > 0 && !draft.noCharge && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {catalog.map((service) => {
                    const on = draft.items.some((i) => i.serviceId === service.id);
                    return (
                      <button
                        key={service.id} type="button" aria-pressed={on} onClick={() => toggleService(service)}
                        className={`min-h-11 rounded-full border px-3 py-1 text-sm ${on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                      >
                        {service.name} · {money(Number(service.price))}
                      </button>
                    );
                  })}
                </div>
              )}

              {selected.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {selected.map(({ item, service }) => (
                    <li key={service.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{service.name}{service.isPackage && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">Paquete</span>}</p>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={item.performed} onChange={(e) => patchItem(service.id, { performed: e.target.checked })} />
                          Realizada
                        </label>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <label className="text-sm">
                          Cantidad
                          <input
                            className={`${field} mt-1`} type="number" min="1" step="1" value={item.quantity}
                            onChange={(e) => patchItem(service.id, { quantity: Number(e.target.value) })}
                          />
                        </label>
                        <p className="self-end text-sm text-muted-foreground">
                          Precio de catálogo: {money(Number(service.price))}. El servidor confirma la tarifa vigente al guardar.
                        </p>
                      </div>
                      {service.components.filter((c) => c.productId).length > 0 && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Descuenta: {service.components.filter((c) => c.productId).map((c) => `${c.productName ?? `producto ${c.productId}`} ${Number(c.quantity) * item.quantity}${c.productUnit ? ` ${c.productUnit}` : ''}${c.optional ? ' (opcional)' : ''}`).join(' · ')}
                        </p>
                      )}
                      {service.aftercare && <p className="mt-1 text-xs text-muted-foreground">Indicaciones sugeridas: {service.aftercare}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Monto libre: solo cuando no hay prestaciones seleccionadas, para
                no producir dos cobros por la misma atención. */}
            {!draft.items.length && (
              <>
                <label className="block text-sm">
                  Descripción del servicio
                  <input className={`${field} mt-1`} maxLength={255} value={draft.description} disabled={draft.noCharge} onChange={(e) => update('description', e.target.value)} />
                </label>
                <label className="block text-sm">
                  Total a cobrar (CLP)
                  <input className={`${field} mt-1`} type="number" min="1" step="1" value={draft.amount} disabled={draft.noCharge} onChange={(e) => update('amount', e.target.value)} />
                </label>
              </>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox" checked={draft.noCharge}
                onChange={(e) => {
                  update('noCharge', e.target.checked);
                  if (e.target.checked) setDraft((d) => ({ ...d, amount: '', payment: '', items: [] }));
                }}
              />
              Atención sin costo
            </label>
          </>
        )}

        {!draft.noCharge && (!invoice || balance > 0) && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Monto recibido ahora (opcional)
              <input className={`${field} mt-1`} type="number" min="1" step="1" value={draft.payment} onChange={(e) => update('payment', e.target.value)} />
            </label>
            <label className="text-sm">
              Medio de pago
              <select className={`${field} mt-1`} value={draft.method} onChange={(e) => update('method', e.target.value as typeof draft.method)}>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia recibida</option>
                <option value="otro">Otro</option>
              </select>
            </label>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Registra únicamente pagos ya recibidos. Sin señal el registro queda pendiente de confirmación.
        </p>
      </fieldset>

      {!invoice && (lines.length > 0 || draft.amount) && (
        <ChargeSummary
          totals={{
            lines: lines.length ? lines : [{ id: 'libre', description: draft.description || 'Atención', quantity: 1, unitPrice: Number(draft.amount) || 0 }],
            received: Number(draft.payment) || 0,
          }}
          footnote="Propuesta calculada con los precios de la última carga del catálogo. El importe definitivo lo fija el servidor al confirmar."
        />
      )}

      {/* Tres hechos distintos, escritos por separado a propósito. */}
      <div className="space-y-1 border-t pt-4 text-sm">
        <p>Prestación realizada: {ownRecords.length ? 'consulta guardada' : clinicalChanged ? 'lista para guardar' : 'pendiente'}</p>
        <p>Cobro emitido: {invoice ? 'sí' : draft.noCharge ? 'sin costo' : draft.items.length || draft.amount ? 'al confirmar' : 'pendiente'}</p>
        <p>Pago recibido: {invoice ? (balance > 0 ? `parcial, saldo ${money(balance)}` : 'completo') : draft.payment ? 'al confirmar' : 'no registrado'}</p>
      </div>

      <a className="inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium" href={`/citas/nueva?${context}&followup=1`}>
        Programar control
      </a>
    </section>
  );
}

function useCatalog() {
  const [catalog, setCatalog] = useState<CatalogService[]>([]);
  const [state, setState] = useState<'cargando' | 'listo' | 'error' | 'sin-conexion'>('cargando');

  useEffect(() => {
    let active = true;
    if (!features.catalogoServicios) { setState('listo'); return; }
    if (typeof navigator !== 'undefined' && !navigator.onLine) { setState('sin-conexion'); return; }
    fetch('/api/services')
      .then((r) => { if (!r.ok) throw new Error('catálogo'); return r.json(); })
      .then((data: CatalogService[]) => { if (active) { setCatalog(data); setState('listo'); } })
      .catch(() => { if (active) setState(navigator.onLine ? 'error' : 'sin-conexion'); });
    return () => { active = false; };
  }, []);

  return { catalog, state };
}
