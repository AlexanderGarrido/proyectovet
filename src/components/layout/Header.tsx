import { useState, useEffect, useRef } from 'react';
import { Menu, Moon, Sun, PanelLeft, Search, LogOut, PawPrint, Users, Loader2 } from 'lucide-react';
import { OnlineStatus } from '../common/OnlineStatus';
import { signOut } from '../../lib/auth-client';
import { cn } from '../../lib/utils';

interface HeaderProps {
  title: string;
  userName: string;
  userRole: string;
  onMenuToggle: () => void;
  onSidebarCollapse?: () => void;
}

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  veterinario: 'Veterinario',
  recepcionista: 'Recepcionista',
};

interface PatientResult { id: number; name: string; ownerFirstName?: string | null; ownerLastName?: string | null; }
interface OwnerResult { id: number; firstName: string; lastName: string; }

export function Header({ title, userName, userRole, onMenuToggle, onSidebarCollapse }: HeaderProps) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved === 'dark' || (!saved && prefersDark);
    setDark(isDark);
    if (isDark) document.documentElement.classList.add('dark');
  }, []);

  function toggleDark() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  }

  async function handleLogout() {
    await signOut();
    window.location.href = '/login';
  }

  const initials = userName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-card px-4 h-16 lg:px-6">
      {/* Mobile hamburger — p-3 + icono 20px ≈ 44px, mínimo táctil de campo */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden p-3 -m-1 rounded-md hover:bg-muted shrink-0"
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </button>
      {/* Desktop sidebar toggle */}
      <button
        onClick={onSidebarCollapse}
        className="hidden lg:flex p-3 -m-1 rounded-md hover:bg-muted transition-colors shrink-0"
        aria-label="Colapsar menú lateral"
      >
        <PanelLeft size={20} />
      </button>

      <h1 className="text-lg font-semibold truncate shrink-0 hidden sm:block">{title}</h1>

      <div className="flex-1 min-w-0 max-w-md">
        <HeaderSearch />
      </div>

      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        <OnlineStatus />
        <button
          onClick={toggleDark}
          className="p-3 -m-1 rounded-md hover:bg-muted transition-colors"
          aria-label={dark ? 'Modo claro' : 'Modo oscuro'}
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="w-px h-6 bg-border mx-1 hidden sm:block" />

        <div className="flex items-center gap-2.5 pl-1">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold bg-primary text-primary-foreground shrink-0">
            {initials}
          </div>
          <div className="min-w-0 hidden sm:block">
            <p className="text-sm font-medium truncate leading-tight">{userName}</p>
            <p className="text-xs text-muted-foreground truncate leading-tight">{roleLabels[userRole] || userRole}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="p-3 -m-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}

/**
 * Búsqueda rápida de pacientes/tutores desde el header — reutiliza los
 * endpoints ya existentes y protegidos (?search=), sin backend nuevo.
 * Solo se muestra a staff (un tutor no tiene por qué buscar en toda la
 * clínica; además esos endpoints ya rechazan su rol).
 */
function HeaderSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [patients, setPatients] = useState<PatientResult[]>([]);
  const [owners, setOwners] = useState<OwnerResult[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setPatients([]);
      setOwners([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const [patientsRes, ownersRes] = await Promise.all([
          fetch(`/api/patients?search=${encodeURIComponent(q)}&limit=5`),
          fetch(`/api/owners?search=${encodeURIComponent(q)}&limit=5`),
        ]);
        setPatients(patientsRes.ok ? await patientsRes.json() : []);
        setOwners(ownersRes.ok ? await ownersRes.json() : []);
      } catch {
        setPatients([]);
        setOwners([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasResults = patients.length > 0 || owners.length > 0;
  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar pacientes, tutores..."
          className="w-full pl-9 pr-3 h-10 rounded-lg bg-muted border border-transparent text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:bg-background focus:border-border transition-colors"
        />
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-popover border border-border rounded-lg shadow-lg overflow-hidden max-h-96 overflow-y-auto z-50">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando...
            </div>
          ) : !hasResults ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin resultados para "{query}"</p>
          ) : (
            <>
              {patients.length > 0 && (
                <div className="py-1.5">
                  <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">Pacientes</p>
                  {patients.map((p) => (
                    <a key={p.id} href={`/pacientes/${p.id}`}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors">
                      <PawPrint className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate">{p.name}</span>
                      {(p.ownerFirstName || p.ownerLastName) && (
                        <span className="text-xs text-muted-foreground truncate">— {p.ownerFirstName} {p.ownerLastName}</span>
                      )}
                    </a>
                  ))}
                </div>
              )}
              {owners.length > 0 && (
                <div className={cn('py-1.5', patients.length > 0 && 'border-t border-border')}>
                  <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">Tutores</p>
                  {owners.map((o) => (
                    <a key={o.id} href={`/tutores/${o.id}`}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors">
                      <Users className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate">{o.firstName} {o.lastName}</span>
                    </a>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
