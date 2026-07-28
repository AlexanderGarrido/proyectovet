import type { UserRole } from '../db/schema/users';

type Permission = string;

const permissions: Record<UserRole, Permission[]> = {
  admin: ['*'],
  veterinario: [
    'patients:read',
    'patients:write',
    'owners:read',
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
    'invoices:read',
    // El vet en el domicilio necesita poder cobrar en el momento (efectivo o
    // link de pago), no solo recepción/admin desde la clínica.
    'payments:read',
    'payments:write',
    'inventory:read',
    'dashboard:read',
  ],
  recepcionista: [
    'patients:read',
    'patients:write',
    'owners:read',
    'owners:write',
    'appointments:read',
    'appointments:write',
    'invoices:read',
    'invoices:write',
    'payments:read',
    'payments:write',
    'inventory:read',
    'dashboard:read',
  ],
  tutor: [
    'patients:read:own',
    'appointments:read:own',
    'appointments:create',
    'prescriptions:read:own',
    'lab-orders:read:own',
    'vaccines:read:own',
    'invoices:read:own',
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

// Páginas exclusivas de staff — un tutor nunca debe acceder a ellas
export const STAFF_ROUTES = [
  '/pacientes',
  '/tutores',
  '/citas',
  '/recetas',
  '/ordenes',
  '/inventario',
  '/facturacion',
  '/metricas',
  '/configuracion',
];

export function getNavItems(role: UserRole) {
  // El rol tutor tiene acceso restringido: solo el dashboard (su portal).
  // Las páginas de gestión (pacientes, citas, recetas…) son herramientas de
  // staff y no están preparadas para mostrar solo datos propios del tutor.
  if (role === 'tutor') {
    return [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard' },
    ];
  }

  const allItems = [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', permission: 'dashboard:read' },
    { label: 'Pacientes', href: '/pacientes', icon: 'PawPrint', permission: 'patients:read' },
    { label: 'Tutores', href: '/tutores', icon: 'Users', permission: 'owners:read' },
    { label: 'Citas', href: '/citas', icon: 'Calendar', permission: 'appointments:read' },
    { label: 'Recetas', href: '/recetas', icon: 'FileText', permission: 'prescriptions:read' },
    { label: 'Laboratorio', href: '/ordenes', icon: 'FlaskConical', permission: 'lab-orders:read' },
    { label: 'Inventario', href: '/inventario', icon: 'Package', permission: 'inventory:read' },
    { label: 'Facturacion', href: '/facturacion', icon: 'Receipt', permission: 'invoices:read' },
    { label: 'Metricas', href: '/metricas', icon: 'BarChart3', permission: 'invoices:read' },
    { label: 'Configuracion', href: '/configuracion', icon: 'Settings', permission: 'admin' },
  ];

  return allItems.filter((item) => {
    if (item.permission === 'admin') return role === 'admin';
    const [resource, action] = item.permission.split(':');
    return hasPermission(role, resource, action);
  });
}
