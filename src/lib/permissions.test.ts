import { describe, it, expect } from 'vitest';
import { hasPermission, requiresOwnershipCheck } from './permissions';

// ── hasPermission ─────────────────────────────────────────────────────────────
describe('hasPermission', () => {
  describe('admin', () => {
    it('tiene acceso total (*)', () => {
      expect(hasPermission('admin', 'patients', 'read')).toBe(true);
      expect(hasPermission('admin', 'invoices', 'write')).toBe(true);
      expect(hasPermission('admin', 'users', 'delete')).toBe(true);
      expect(hasPermission('admin', 'anything', 'anything')).toBe(true);
    });
  });

  describe('veterinario', () => {
    it('puede leer pacientes', () => {
      expect(hasPermission('veterinario', 'patients', 'read')).toBe(true);
    });

    it('puede escribir registros médicos', () => {
      expect(hasPermission('veterinario', 'medical-records', 'write')).toBe(true);
    });

    it('puede gestionar recetas', () => {
      expect(hasPermission('veterinario', 'prescriptions', 'read')).toBe(true);
      expect(hasPermission('veterinario', 'prescriptions', 'write')).toBe(true);
    });

    it('puede escribir facturas (emitir/cobrar en el domicilio)', () => {
      expect(hasPermission('veterinario', 'invoices', 'write')).toBe(true);
    });

    it('puede gestionar inventario (write) — ajustar su botiquín', () => {
      expect(hasPermission('veterinario', 'inventory', 'write')).toBe(true);
    });
  });

  describe('recepcionista', () => {
    it('puede gestionar citas', () => {
      expect(hasPermission('recepcionista', 'appointments', 'read')).toBe(true);
      expect(hasPermission('recepcionista', 'appointments', 'write')).toBe(true);
    });

    it('puede gestionar tutores', () => {
      expect(hasPermission('recepcionista', 'owners', 'read')).toBe(true);
      expect(hasPermission('recepcionista', 'owners', 'write')).toBe(true);
    });

    it('puede leer inventario', () => {
      expect(hasPermission('recepcionista', 'inventory', 'read')).toBe(true);
    });

    it('NO puede escribir registros médicos', () => {
      expect(hasPermission('recepcionista', 'medical-records', 'write')).toBe(false);
    });

    it('NO puede escribir recetas', () => {
      expect(hasPermission('recepcionista', 'prescriptions', 'write')).toBe(false);
    });
  });

  describe('rol desconocido / retirado', () => {
    it('niega todo para un rol que no existe en la tabla de permisos', () => {
      // 'tutor' fue retirado del producto; cualquier rol no reconocido cae aquí.
      expect(hasPermission('tutor' as any, 'patients', 'read')).toBe(false);
      expect(hasPermission('tutor' as any, 'appointments', 'create')).toBe(false);
      expect(hasPermission('desconocido' as any, 'dashboard', 'read')).toBe(false);
    });
  });
});

// ── requiresOwnershipCheck ────────────────────────────────────────────────────
describe('requiresOwnershipCheck', () => {
  it('ningún rol de staff usa la variante :own (todo el acceso es directo)', () => {
    expect(requiresOwnershipCheck('veterinario', 'patients', 'read')).toBe(false);
    expect(requiresOwnershipCheck('recepcionista', 'appointments', 'read')).toBe(false);
  });

  it('admin → false (acceso total, sin ownership check)', () => {
    expect(requiresOwnershipCheck('admin', 'patients', 'read')).toBe(false);
  });

  it('veterinario → false para patients:read (permiso directo)', () => {
    expect(requiresOwnershipCheck('veterinario', 'patients', 'read')).toBe(false);
  });

  it('recepcionista → false para appointments:read (permiso directo)', () => {
    expect(requiresOwnershipCheck('recepcionista', 'appointments', 'read')).toBe(false);
  });
});
