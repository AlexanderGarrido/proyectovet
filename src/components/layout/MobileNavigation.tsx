import { LayoutDashboard, PawPrint, Calendar, Package, Receipt, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { isNavItemActive, type NavItem } from '../../lib/permissions';

const iconMap: Record<string, LucideIcon> = { LayoutDashboard, PawPrint, Calendar, Package, Receipt };

/**
 * Barra inferior para uso a una mano en terreno: el veterinario sostiene al
 * paciente con una mano y el teléfono con la otra, así que los destinos
 * principales tienen que quedar al alcance del pulgar, no detrás del menú
 * hamburguesa del encabezado. Solo aparece en móvil; en escritorio se
 * conserva el lateral.
 *
 * Respeta `env(safe-area-inset-bottom)` para no quedar bajo la barra de
 * gestos de iOS, y se oculta cuando el teclado virtual está abierto (de lo
 * contrario tapa los campos del formulario de atención).
 */
export function MobileNavigation({ navItems, currentPath }: { navItems: NavItem[]; currentPath: string }) {
  const items = navItems.filter((item) => item.primary).slice(0, 5);
  if (!items.length) return null;

  return (
    <nav
      aria-label="Navegación principal móvil"
      data-mobile-nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const Icon = iconMap[item.icon] || LayoutDashboard;
          const active = isNavItemActive(item, currentPath);
          return (
            <li key={item.href}>
              <a
                href={item.href}
                aria-current={active ? 'page' : undefined}
                // min-h-14 + icono: el objetivo táctil supera los 44px aun con
                // la etiqueta en dos líneas en pantallas de 360px.
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium leading-tight',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon size={20} className="shrink-0" aria-hidden />
                <span className="w-full truncate text-center">{item.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
