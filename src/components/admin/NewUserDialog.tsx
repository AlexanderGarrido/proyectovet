import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter, DialogCloseButton } from '../ui/dialog';
import { Button } from '../ui/button';

type Role = 'admin' | 'veterinario' | 'recepcionista';

const EMPTY = { name: '', email: '', phone: '', password: '', role: 'recepcionista' as Role };

export function NewUserDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || 'No se pudo crear el usuario');
        return;
      }
      toast.success('Usuario creado');
      setForm(EMPTY);
      setOpen(false);
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30';

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <UserPlus className="h-3.5 w-3.5" /> Nuevo usuario
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogHeader>
          <div><DialogTitle>Nuevo usuario del staff</DialogTitle></div>
          <DialogCloseButton onClose={() => setOpen(false)} />
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogContent>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Nombre completo *</label>
                <input required value={form.name} onChange={(e) => set('name', e.target.value)}
                  className={inputClass} placeholder="Dra. Sofía Mora" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Correo electrónico *</label>
                <input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
                  className={inputClass} placeholder="sofia@clinica.cl" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Teléfono</label>
                <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)}
                  className={inputClass} placeholder="+56 9 1234 5678" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Rol *</label>
                <select value={form.role} onChange={(e) => set('role', e.target.value as Role)}
                  className={inputClass}>
                  <option value="recepcionista">Recepcionista</option>
                  <option value="veterinario">Veterinario</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Contraseña *</label>
                <input required type="password" minLength={8} value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  className={inputClass} placeholder="Mín. 8 caracteres" />
              </div>
            </div>
          </DialogContent>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Creando...' : 'Crear usuario'}</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}
