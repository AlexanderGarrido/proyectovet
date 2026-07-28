import { useState, useEffect } from 'react';
import { Plus, Truck, Warehouse, ArrowRightLeft, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { Skeleton } from '../ui/skeleton';
import { formatQty } from '../../lib/utils';

interface Location {
  id: number;
  name: string;
  type: 'central' | 'vehiculo';
  assignedVetId: string | null;
  isActive: boolean;
}
interface Vet { id: string; name: string }
interface Product { id: number; name: string; unit: string; stock: string }
interface LocationStockRow { productId: number; productName: string; unit: string; stock: string }

const typeLabels: Record<string, string> = { central: 'Bodega', vehiculo: 'Vehículo' };

export function StockLocations({ userRole }: { userRole: string }) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [vets, setVets] = useState<Vet[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockByLocation, setStockByLocation] = useState<Record<number, LocationStockRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [showNewLocation, setShowNewLocation] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [locsRes, vetsRes, prodsRes] = await Promise.all([
      fetch('/api/inventory/locations'),
      fetch('/api/veterinarians'),
      fetch('/api/inventory?limit=200'),
    ]);
    const locs: Location[] = locsRes.ok ? await locsRes.json() : [];
    setVets(vetsRes.ok ? await vetsRes.json() : []);
    setProducts(prodsRes.ok ? await prodsRes.json() : []);
    setLocations(locs);

    const stockEntries = await Promise.all(
      locs.map(async (l) => {
        const res = await fetch(`/api/inventory/locations/${l.id}/stock`);
        return [l.id, res.ok ? await res.json() : []] as const;
      })
    );
    setStockByLocation(Object.fromEntries(stockEntries));
    setLoading(false);
  }

  function vetName(id: string | null) {
    return id ? vets.find((v) => v.id === id)?.name ?? '—' : null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground max-w-lg">
          Inventario repartido entre la bodega central y el vehículo de cada veterinario.
          Lo que no aparece asignado a ninguna ubicación sigue disponible como stock general.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowTransfer(true)}>
            <ArrowRightLeft className="h-3.5 w-3.5" /> Transferir stock
          </Button>
          {userRole === 'admin' && (
            <Button size="sm" onClick={() => setShowNewLocation(true)}>
              <Plus className="h-3.5 w-3.5" /> Nueva ubicación
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : locations.length === 0 ? (
        <EmptyState icon={Warehouse} title="Aún no hay ubicaciones de botiquín registradas" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {locations.map((loc) => (
            <div key={loc.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                {loc.type === 'vehiculo' ? <Truck className="h-4 w-4 text-primary" /> : <Warehouse className="h-4 w-4 text-primary" />}
                <span className="font-medium">{loc.name}</span>
                <span className="text-xs text-muted-foreground ml-auto">{typeLabels[loc.type]}</span>
              </div>
              {loc.assignedVetId && (
                <p className="text-xs text-muted-foreground mb-2">Asignado a {vetName(loc.assignedVetId)}</p>
              )}
              {(stockByLocation[loc.id]?.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground italic">Sin stock asignado todavía</p>
              ) : (
                <ul className="text-sm space-y-1 mt-2">
                  {stockByLocation[loc.id].map((row) => (
                    <li key={row.productId} className="flex justify-between">
                      <span>{row.productName}</span>
                      <span className="font-medium">{formatQty(row.stock)} {row.unit}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {showNewLocation && (
        <NewLocationModal vets={vets} onClose={() => setShowNewLocation(false)} onCreated={() => { setShowNewLocation(false); loadAll(); }} />
      )}
      {showTransfer && (
        <TransferModal products={products} locations={locations} onClose={() => setShowTransfer(false)} onDone={() => { setShowTransfer(false); loadAll(); }} />
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-card rounded-xl border max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1.5 -m-1 rounded-md hover:bg-muted" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function NewLocationModal({ vets, onClose, onCreated }: { vets: Vet[]; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'central' | 'vehiculo'>('vehiculo');
  const [assignedVetId, setAssignedVetId] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/inventory/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type, assignedVetId: assignedVetId || null }),
    });
    setLoading(false);
    if (!res.ok) { const j = await res.json(); toast.error(j.error || 'No se pudo crear la ubicación'); return; }
    toast.success('Ubicación creada');
    onCreated();
  }

  return (
    <Modal title="Nueva ubicación de botiquín" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Nombre *</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Móvil — Dra. Rojas"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Tipo *</label>
          <select value={type} onChange={(e) => setType(e.target.value as any)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="vehiculo">Vehículo</option>
            <option value="central">Bodega central</option>
          </select>
        </div>
        {type === 'vehiculo' && (
          <div>
            <label className="block text-sm font-medium mb-1">Veterinario asignado</label>
            <select value={assignedVetId} onChange={(e) => setAssignedVetId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">Sin asignar</option>
              {vets.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        )}
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={loading}>{loading ? 'Creando...' : 'Crear ubicación'}</Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Modal>
  );
}

function TransferModal({ products, locations, onClose, onDone }: {
  products: Product[]; locations: Location[]; onClose: () => void; onDone: () => void;
}) {
  const [productId, setProductId] = useState('');
  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/inventory/locations/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: Number(productId),
        toLocationId: Number(toLocationId),
        fromLocationId: fromLocationId ? Number(fromLocationId) : null,
        quantity: Number(quantity),
      }),
    });
    setLoading(false);
    if (!res.ok) { const j = await res.json(); toast.error(j.error || 'No se pudo transferir el stock'); return; }
    toast.success('Stock transferido');
    onDone();
  }

  return (
    <Modal title="Transferir stock entre ubicaciones" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Producto *</label>
          <select required value={productId} onChange={(e) => setProductId(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">Seleccionar...</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} (total: {formatQty(p.stock)})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Desde</label>
          <select value={fromLocationId} onChange={(e) => setFromLocationId(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">Stock general (sin asignar)</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Hacia *</label>
          <select required value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">Seleccionar...</option>
            {locations.filter((l) => String(l.id) !== fromLocationId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Cantidad *</label>
          <input required type="number" step="any" min="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={loading}>{loading ? 'Transfiriendo...' : 'Transferir'}</Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Modal>
  );
}
