import { fetchFormData, safeVisitReturn, verifyInvoiceContext } from '../../lib/form-context';
import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Owner { id: number; firstName: string; lastName: string; }
interface Product { id: number; name: string; unitPrice: string; }
interface LineItem { description: string; productId?: number; quantity: number; unitPrice: number; }

export function InvoiceForm({ ownerId: initialOwnerId, patientId, appointmentId, returnTo }: { ownerId?: number; patientId?: number; appointmentId?: number; returnTo?: string }) {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ownerId, setOwnerId] = useState(initialOwnerId?.toString() || '');
  const [contextReady, setContextReady] = useState(false);
  const [items, setItems] = useState<LineItem[]>([{ description: '', quantity: 1, unitPrice: 0 }]);
  const [taxRate, setTaxRate] = useState('0');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [o, p] = await Promise.all([fetchFormData<Owner[]>('/api/owners'), fetchFormData<Product[]>('/api/inventory')]);
        setProducts(p);
        let resolvedOwner = initialOwnerId;
        if (appointmentId) {
          const a = await fetchFormData<{ ownerId: number; patientId: number; reason?: string }>(`/api/appointments/${appointmentId}`);
          verifyInvoiceContext(a, { ownerId: initialOwnerId, patientId });
          resolvedOwner = a.ownerId;
          setOwnerId(String(a.ownerId));
          if (a.reason) setItems([{ description: a.reason, quantity: 1, unitPrice: 0 }]);
        } else if (patientId) {
          const patient = await fetchFormData<{ ownerId: number }>(`/api/patients/${patientId}`);
          verifyInvoiceContext({ ...patient, patientId }, { ownerId: initialOwnerId, patientId });
          resolvedOwner = patient.ownerId;
          setOwnerId(String(patient.ownerId));
        }
        if (resolvedOwner && !o.some((owner) => owner.id === resolvedOwner)) o.push(await fetchFormData<Owner>(`/api/owners/${resolvedOwner}`));
        setOwners(o);
        setContextReady(true);
      } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar el contexto del cobro'); }
    }
    void load();
  }, []);

  function addItem() { setItems([...items, { description: '', quantity: 1, unitPrice: 0 }]); }
  function removeItem(i: number) { setItems(items.filter((_, idx) => idx !== i)); }
  function updateItem(i: number, field: keyof LineItem, value: any) {
    const updated = [...items];
    updated[i] = { ...updated[i], [field]: value };
    if (field === 'productId' && value) {
      const p = products.find((p) => p.id === Number(value));
      if (p) { updated[i].description = p.name; updated[i].unitPrice = parseFloat(p.unitPrice); }
    }
    setItems(updated);
  }

  const subtotal = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const tax = subtotal * (parseFloat(taxRate) / 100);
  const total = subtotal + tax;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contextReady) { setError('Espera la validación de la cita y responsable'); return; }
    if (!ownerId) { setError('Selecciona un tutor'); return; }
    if (items.some((it) => !it.description || it.quantity < 1)) { setError('Completa todos los items'); return; }
    setLoading(true);
    setError('');
    try {
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId: Number(ownerId), appointmentId, patientId, items, taxRate: parseFloat(taxRate), notes }),
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error || 'Error al guardar'); setError(json.error || 'Error al guardar'); setLoading(false); return; }
    toast.success('Factura creada correctamente');
    setTimeout(() => { window.location.href = safeVisitReturn(returnTo) || `/facturacion/${json.id}`; }, 500);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar. Reintenta.'); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 max-w-3xl">
      {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

      <div>
        <label className="block text-sm font-medium mb-1">Tutor *</label>
        <select disabled={!!appointmentId || !!patientId} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
          <option value="">Seleccionar tutor...</option>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.firstName} {o.lastName}</option>)}
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">Servicios / Productos</label>
          <button type="button" onClick={addItem}
            className="flex items-center gap-1 text-xs text-primary hover:underline">
            <Plus className="h-3.5 w-3.5" /> Agregar línea
          </button>
        </div>
        <div className="rounded-xl border overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Descripción</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground w-20">Cant.</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">Precio unit.</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">Subtotal</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <select
                        value={item.productId || ''}
                        onChange={(e) => updateItem(i, 'productId', e.target.value ? Number(e.target.value) : undefined)}
                        className="text-xs border rounded px-2 py-1 w-28 shrink-0">
                        <option value="">Producto...</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <input value={item.description} onChange={(e) => updateItem(i, 'description', e.target.value)}
                        placeholder="Descripción del servicio..."
                        aria-label={`Descripción del item ${i + 1}`}
                        className="flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30" />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))}
                      aria-label={`Cantidad del item ${i + 1}`}
                      className="w-full border rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary/30" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" step="0.01" min="0" value={item.unitPrice} onChange={(e) => updateItem(i, 'unitPrice', parseFloat(e.target.value) || 0)}
                      aria-label={`Precio unitario del item ${i + 1}`}
                      className="w-full border rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary/30" />
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-medium">
                    ${(item.quantity * item.unitPrice).toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-2 py-2">
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex gap-6 justify-end text-sm">
        <div className="space-y-2 w-56">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>${subtotal.toLocaleString('es-CL', { maximumFractionDigits: 0 })}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">IVA (%)</span>
            <input type="number" min="0" max="100" step="0.1" value={taxRate} onChange={(e) => setTaxRate(e.target.value)}
              className="w-16 border rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary/30" />
          </div>
          <div className="flex justify-between font-bold border-t pt-2">
            <span>Total</span>
            <span>${total.toLocaleString('es-CL', { maximumFractionDigits: 0 })}</span>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Notas</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={loading || !contextReady}
          className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors">
          {loading ? 'Guardando...' : 'Emitir Factura'}
        </button>
        <a href={safeVisitReturn(returnTo) || "/facturacion"} className="px-6 py-2 rounded-lg text-sm font-medium border hover:bg-muted transition-colors">Cancelar</a>
      </div>
    </form>
  );
}
