import type { UserRole } from '../db/schema/users';

type Permission = string;

const permissions: Record<UserRole, Permission[]> = {
  admin: ['*'],
  veterinario: [
    'patients:read',
    'patients:write',
    'owners:read',
    // El vet en terreno necesita poder crear/invitar tutores nuevos (visita
    // a un cliente que aún no tiene ficha) sin depender de recepción.
    'owners:write',
    'medical-records:read',
    'medical-records:write',
    'prescriptions:read',
    'prescriptions:write',
    'lab-orders:read',
    'lab-orders:write',
    'appointments:read',
    'appointments:write',
    'vaccines:read',
    'vaccines:write',
    'consents:read',
    'consents:write',
    'invoices:read',
    // Puede emitir la factura en el momento de la visita, no solo cobrarla.
    'invoices:write',
    // El vet en el domicilio necesita poder cobrar en el momento (efectivo o
    // link de pago), no solo recepción/admin desde la clínica.
    'payments:read',
    'payments:write',
    'inventory:read',
    // Ajustar el stock de su propio botiquín (vehículo) tras usar insumos.
    'inventory:write',
    'dashboard:read',
  ],
  recepcionista: [
    'patients:read',
    'patients:write',
    'owners:read',
    'owners:write',
    'appointments:read',
    'appointments:write',
    'consents:read',
    // El widget de recordatorios de vacunas del dashboard ya se le mostraba
    // a recepción (llama a los tutores para agendar el refuerzo) — sin este
    // permiso, requireUnscopedPermission en /api/vaccines/upcoming la
    // bloquearía, una regresión no intencional.
    'vaccines:read',
    'invoices:read',
    'invoices:write',
    'payments:read',
    'payments:write',
    'inventory:read',
    'inventory:write',
    'dashboard:read',
  ],
};

export function hasPermission(
  role: UserRole,
  resource: string,
  action: string
): boolean {
  const rolePerms = permissions[role];
  if (!rolePerms) return false;

  // Admin has full access
  if (rolePerms.includes('*')) return true;

  const permVariants = [
    `${resource}:${action}`,
    `${resource}:${action}:own`,
    `${resource}:*`,
  ];

  return permVariants.some((perm) => rolePerms.includes(perm));
}

export function requiresOwnershipCheck(role: UserRole, resource: string, action: string): boolean {
  const rolePerms = permissions[role];
  if (!rolePerms) return true;
  if (rolePerms.includes('*')) return false;

  return rolePerms.includes(`${resource}:${action}:own`);
}

// Agrupación del menú lateral (mismo patrón que la referencia de diseño:
// secciones con encabezado en mayúsculas — Principal/Gestión/Reportes/
// Sistema). Sidebar.tsx solo imprime el encabezado de sección cuando hay
// más de una sección presente.
export interface NavItem {
  label: string;
  href: string;
  icon: string;
  section: string;
  /** Aparece en la barra inferior móvil (una mano, cinco destinos como máximo). */
  primary?: boolean;
  /** Prefijos de ruta que también marcan este ítem como activo. */
  match?: string[];
}

export function getNavItems(role: UserRole): NavItem[] {
  // El menú abría siempre /inventario (listado general de productos) aunque
  // el veterinario en terreno trabaja sobre el botiquín que tiene asignado.
  // La etiqueta y el destino siguen al rol; la ruta general se conserva.
  const inventory = role === 'veterinario'
    ? { label: 'Mi botiquín', href: '/inventario/botiquin', match: ['/inventario'] }
    : { label: 'Botiquín', href: '/inventario', match: ['/inventario'] };

  const allItems: (NavItem & { permission: string })[] = [
    { label: 'Hoy', href: '/dashboard', icon: 'LayoutDashboard', permission: 'dashboard:read', section: 'Principal', primary: true },
    { label: 'Agenda', href: '/citas', icon: 'Calendar', permission: 'appointments:read', section: 'Principal', primary: true, match: ['/citas'] },
    { label: 'Pacientes', href: '/pacientes', icon: 'PawPrint', permission: 'patients:read', section: 'Principal', primary: true, match: ['/pacientes', '/tutores', '/historial', '/recetas', '/ordenes', '/consentimientos'] },
    { ...inventory, icon: 'Package', permission: 'inventory:read', section: 'Principal', primary: true },
    { label: 'Cobros', href: '/facturacion', icon: 'Receipt', permission: 'invoices:read', section: 'Principal', primary: true, match: ['/facturacion'] },
    { label: 'Reportes', href: '/metricas', icon: 'BarChart3', permission: 'admin', section: 'Administración', match: ['/metricas'] },
    { label: 'Configuración', href: '/configuracion', icon: 'Settings', permission: 'admin', section: 'Administración', match: ['/configuracion'] },
  ];

  return allItems
    .filter((item) => {
      if (item.permission === 'admin') return role === 'admin';
      const [resource, action] = item.permission.split(':');
      return hasPermission(role, resource, action);
    })
    .map(({ permission, ...item }) => item);
}

/**
 * Un ítem está activo si la ruta actual es la suya o cae bajo alguno de sus
 * prefijos declarados. Comparar por `startsWith` sobre el href directo hacía
 * que "/inventario/botiquin" no marcara "Botiquín" cuando el href del rol es
 * la otra ruta del mismo área.
 */
export function isNavItemActive(item: NavItem, currentPath: string): boolean {
  if (currentPath === item.href) return true;
  const prefixes = item.match ?? (item.href === '/dashboard' ? [] : [item.href]);
  return prefixes.some((prefix) => currentPath === prefix || currentPath.startsWith(`${prefix}/`));
}
