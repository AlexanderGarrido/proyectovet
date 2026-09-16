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
export function getNavItems(role: UserRole) {
  const allItems = [
    { label: 'Hoy', href: '/dashboard', icon: 'LayoutDashboard', permission: 'dashboard:read', section: 'Principal' },
    { label: 'Agenda', href: '/citas', icon: 'Calendar', permission: 'appointments:read', section: 'Principal' },
    { label: 'Pacientes', href: '/pacientes', icon: 'PawPrint', permission: 'patients:read', section: 'Principal' },
    { label: 'Botiquín', href: '/inventario', icon: 'Package', permission: 'inventory:read', section: 'Principal' },
    { label: 'Cobros', href: '/facturacion', icon: 'Receipt', permission: 'invoices:read', section: 'Principal' },
    { label: 'Reportes', href: '/metricas', icon: 'BarChart3', permission: 'admin', section: 'Administración' },
    { label: 'Configuración', href: '/configuracion', icon: 'Settings', permission: 'admin', section: 'Administración' },
  ];

  return allItems.filter((item) => {
    if (item.permission === 'admin') return role === 'admin';
    const [resource, action] = item.permission.split(':');
    return hasPermission(role, resource, action);
  });
}
