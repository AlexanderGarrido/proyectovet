import { useState, useEffect } from 'react';
import { Pencil, Trash2, Check, X, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';

interface User { id: string; name: string; email: string; role: string; isActive: boolean; }

const roleColors: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  veterinario: 'bg-blue-100 text-blue-700',
  recepcionista: 'bg-cyan-100 text-cyan-700',
};

const roleLabels: Record<string, string> = {
  admin: 'Administrador', veterinario: 'Veterinario', recepcionista: 'Recepcionista',
};

export function UserList({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');

  useEffect(() => { fetchUsers(); }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      setUsers(await res.json());
    } catch {
      toast.error('No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(u: User) {
    setEditingId(u.id);
    setEditRole(u.role);
    setEditName(u.name);
    setEditEmail(u.email);
    setEditPassword('');
  }

  async function saveEdit(id: string) {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: editRole, name: editName, email: editEmail, password: editPassword || undefined }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error || 'No se pudo guardar');
      return;
    }
    toast.success('Usuario actualizado');
    setEditingId(null);
    fetchUsers();
  }

  async function toggleActive(u: User) {
    setBusyId(u.id);
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !u.isActive }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(j.error || 'No se pudo cambiar el estado'); return; }
      toast.success(u.isActive ? 'Usuario desactivado' : 'Usuario reactivado');
      fetchUsers();
    } finally {
      setBusyId(null);
    }
  }

  async function deleteUser(u: User) {
    if (!confirm(`¿Eliminar a ${u.name}? Esta acción no se puede deshacer.`)) return;
    setBusyId(u.id);
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 409: tiene registros asociados → sugerir desactivar
        toast.error(j.error || 'No se pudo eliminar', { duration: 6000 });
        return;
      }
      toast.success('Usuario eliminado');
      fetchUsers();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );

  return (
    <div className="rounded-xl border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Correo</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Rol</th>
            <th className="px-4 py-3 w-32" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {users.map((u) => {
            const inactive = !u.isActive;
            const editing = editingId === u.id;
            return (
            <tr key={u.id} className={`hover:bg-muted/20 transition-colors ${inactive ? 'opacity-55' : ''}`}>
              <td className="px-4 py-3">
                {editing ? (
                  <input value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 w-full" />
                ) : (
                  <span className="font-medium inline-flex items-center gap-2">
                    {u.name}
                    {inactive && <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700">Inactivo</span>}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {editing ? (
                  <div className="space-y-1">
                    <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="Correo" type="email"
                      className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 w-full" />
                    <input value={editPassword} onChange={(e) => setEditPassword(e.target.value)}
                      placeholder="Nueva contraseña (opcional)" type="password"
                      className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 w-full" />
                  </div>
                ) : (
                  u.email
                )}
              </td>
              <td className="px-4 py-3">
                {editing ? (
                  <select value={editRole} onChange={(e) => setEditRole(e.target.value)}
                    className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30">
                    <option value="admin">Administrador</option>
                    <option value="veterinario">Veterinario</option>
                    <option value="recepcionista">Recepcionista</option>
                  </select>
                ) : (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${roleColors[u.role] || 'bg-gray-100'}`}>
                    {roleLabels[u.role] || u.role}
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                {editing ? (
                  <div className="flex gap-1">
                    <button onClick={() => saveEdit(u.id)} aria-label="Guardar" className="p-1.5 rounded hover:bg-green-50 text-green-600">
                      <Check className="h-4 w-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} aria-label="Cancelar" className="p-1.5 rounded hover:bg-red-50 text-red-400">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <button onClick={() => startEdit(u)} aria-label="Editar" className="p-1.5 rounded hover:bg-muted text-muted-foreground">
                      <Pencil className="h-4 w-4" />
                    </button>
                    {u.id !== currentUserId && (
                      <>
                        <button
                          onClick={() => toggleActive(u)}
                          disabled={busyId === u.id}
                          aria-label={inactive ? 'Reactivar' : 'Desactivar'}
                          title={inactive ? 'Reactivar' : 'Desactivar'}
                          className={`p-1.5 rounded disabled:opacity-50 ${inactive ? 'hover:bg-green-50 text-green-600' : 'hover:bg-amber-50 text-amber-600'}`}
                        >
                          {inactive ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => deleteUser(u)}
                          disabled={busyId === u.id}
                          aria-label="Eliminar"
                          title="Eliminar"
                          className="p-1.5 rounded hover:bg-red-50 text-red-400 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
