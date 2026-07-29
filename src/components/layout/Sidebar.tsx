import {
  LayoutDashboard,
  PawPrint,
  Calendar,
  FileText,
  FlaskConical,
  Package,
  Receipt,
  BarChart3,
  Settings,
  Users,
  X,
  FileSignature,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  PawPrint,
  Calendar,
  FileText,
  FlaskConical,
  Package,
  Receipt,
  BarChart3,
  Settings,
  Users,
  FileSignature,
};

interface NavItem {
  label: string;
  href: string;
  icon: string;
  section: string;
}

interface SidebarProps {
  navItems: NavItem[];
  currentPath: string;
  isOpen: boolean;
  collapsed?: boolean;
  animated?: boolean;
  onClose: () => void;
}

/** Agrupa los ítems en secciones consecutivas, preservando el orden. */
function groupBySection(items: NavItem[]): { section: string; items: NavItem[] }[] {
  const groups: { section: string; items: NavItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.section === item.section) {
      last.items.push(item);
    } else {
      groups.push({ section: item.section, items: [item] });
    }
  }
  return groups;
}

export function Sidebar({
  navItems,
  currentPath,
  isOpen,
  collapsed = false,
  animated = false,
  onClose,
}: SidebarProps) {
  const groups = groupBySection(navItems);
  // Con una sola sección (ej. el tutor solo tiene "Principal") el
  // encabezado no aporta nada — se omite, igual que en la referencia no
  // aparecería una única sección rotulada.
  const showSectionLabels = groups.length > 1;

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          role="presentation"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        aria-label="Navegación principal"
        className={cn(
          'fixed top-0 left-0 z-50 h-full flex flex-col lg:static lg:z-auto lg:translate-x-0',
          animated && 'transition-all duration-200',
          'bg-sidebar text-sidebar-foreground border-r border-sidebar-border',
          collapsed ? 'lg:w-16' : 'lg:w-64',
          isOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64'
        )}
      >
        {/* Header / Logo — lockup compacto (marca + texto), no un banner
            grande: sobre fondo blanco un banner ocuparía demasiado peso
            visual, igual que la referencia usa un ícono pequeño + wordmark. */}
        <div
          className={cn(
            'flex items-center border-b border-sidebar-border shrink-0 h-16',
            collapsed ? 'justify-center px-2' : 'justify-between gap-2 px-4'
          )}
        >
          <div className={cn('flex items-center min-w-0', collapsed ? '' : 'gap-2.5')}>
            <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-primary/10 flex items-center justify-center">
              <img src="/logo-alma-mark.png" alt="" className="w-full h-full object-contain" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight truncate">Alma Veterinaria</p>
                <p className="text-xs text-muted-foreground leading-tight truncate">Panel de Gestión</p>
              </div>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={onClose}
              className="lg:hidden p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              aria-label="Cerrar menú"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav aria-label="Menú principal" className="flex-1 px-2 py-3 space-y-4 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.section}>
              {showSectionLabels && !collapsed && (
                <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  {group.section}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = iconMap[item.icon] || LayoutDashboard;
                  const isActive =
                    currentPath === item.href ||
                    (item.href !== '/dashboard' && currentPath.startsWith(item.href));

                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center rounded-lg text-sm font-medium transition-colors',
                        collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2',
                        isActive
                          ? 'bg-sidebar-accent text-primary font-semibold'
                          : 'text-sidebar-foreground/75 hover:bg-muted hover:text-sidebar-foreground'
                      )}
                    >
                      <Icon size={18} className="shrink-0" />
                      {!collapsed && item.label}
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
