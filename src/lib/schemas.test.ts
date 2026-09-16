import { describe, it, expect } from 'vitest';
import {
  ownerFormSchema,
  patientFormSchema,
  appointmentSchema,
  productSchema,
  invoiceSchema,
  medicalRecordSchema,
  prescriptionSchema,
  stockMovementSchema,
  patientUpdateSchema,
  appointmentUpdateSchema,
  userUpdateSchema,
  invoiceUpdateSchema,
  prescriptionUpdateSchema,
  labOrderUpdateSchema,
  patientSchema,
} from './schemas';

// ── ownerFormSchema ───────────────────────────────────────────────────────────
describe('ownerFormSchema', () => {
  it('acepta datos válidos', () => {
    const result = ownerFormSchema.safeParse({
      firstName: 'Juan',
      lastName: 'Pérez',
      email: 'juan@example.com',
      phone: '+506 8888-8888',
    });
    expect(result.success).toBe(true);
  });

  it('requiere firstName', () => {
    const result = ownerFormSchema.safeParse({ firstName: '', lastName: 'Pérez' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain('firstName');
  });

  it('requiere lastName', () => {
    const result = ownerFormSchema.safeParse({ firstName: 'Juan', lastName: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain('lastName');
  });

  it('rechaza email inválido', () => {
    const result = ownerFormSchema.safeParse({
      firstName: 'Juan',
      lastName: 'Pérez',
      email: 'no-es-email',
    });
    expect(result.success).toBe(false);
  });

  it('acepta email vacío (opcional)', () => {
    const result = ownerFormSchema.safeParse({
      firstName: 'Juan',
      lastName: 'Pérez',
      email: '',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza firstName mayor a 100 caracteres', () => {
    const result = ownerFormSchema.safeParse({
      firstName: 'A'.repeat(101),
      lastName: 'Pérez',
    });
    expect(result.success).toBe(false);
  });
});

// ── patientFormSchema ─────────────────────────────────────────────────────────
describe('patientFormSchema', () => {
  const valid = {
    ownerId: '1',
    name: 'Luna',
    species: 'perro' as const,
    sex: 'hembra' as const,
  };

  it('acepta datos válidos', () => {
    expect(patientFormSchema.safeParse(valid).success).toBe(true);
  });

  it('requiere ownerId', () => {
    const result = patientFormSchema.safeParse({ ...valid, ownerId: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain('ownerId');
  });

  it('requiere name', () => {
    const result = patientFormSchema.safeParse({ ...valid, name: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain('name');
  });

  it('rechaza species inválida', () => {
    const result = patientFormSchema.safeParse({ ...valid, species: 'dragon' });
    expect(result.success).toBe(false);
  });

  it('acepta todas las species válidas', () => {
    const species = ['perro', 'gato', 'ave', 'reptil', 'roedor', 'otro'] as const;
    for (const s of species) {
      expect(patientFormSchema.safeParse({ ...valid, species: s }).success).toBe(true);
    }
  });

  it('rechaza sex inválido', () => {
    const result = patientFormSchema.safeParse({ ...valid, sex: 'neutro' });
    expect(result.success).toBe(false);
  });
});

// ── appointmentSchema (API) ───────────────────────────────────────────────────
describe('appointmentSchema', () => {
  const base = {
    patientId: 1,
    ownerId: 1,
    veterinarianId: 'vet-1',
    scheduledAt: '2026-03-15T10:00:00Z',
    endAt: '2026-03-15T11:00:00Z',
    type: 'consulta' as const,
  };

  it('acepta cita válida', () => {
    expect(appointmentSchema.safeParse(base).success).toBe(true);
  });

  it('falla si endAt es anterior a scheduledAt', () => {
    const result = appointmentSchema.safeParse({
      ...base,
      scheduledAt: '2026-03-15T11:00:00Z',
      endAt: '2026-03-15T10:00:00Z',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain('endAt');
  });

  it('falla si endAt es igual a scheduledAt', () => {
    const result = appointmentSchema.safeParse({
      ...base,
      scheduledAt: '2026-03-15T10:00:00Z',
      endAt: '2026-03-15T10:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rechaza tipo inválido', () => {
    const result = appointmentSchema.safeParse({ ...base, type: 'paseo' });
    expect(result.success).toBe(false);
  });

  it('rechaza patientId = 0', () => {
    const result = appointmentSchema.safeParse({ ...base, patientId: 0 });
    expect(result.success).toBe(false);
  });

  it('rechaza veterinarianId vacío', () => {
    const result = appointmentSchema.safeParse({ ...base, veterinarianId: '' });
    expect(result.success).toBe(false);
  });
});

// ── productSchema ─────────────────────────────────────────────────────────────
describe('productSchema', () => {
  const valid = {
    name: 'Amoxicilina 500mg',
    category: 'medicamento' as const,
    unitPrice: 5500,
  };

  it('acepta producto válido', () => {
    expect(productSchema.safeParse(valid).success).toBe(true);
  });

  it('requiere name', () => {
    const result = productSchema.safeParse({ ...valid, name: '' });
    expect(result.success).toBe(false);
  });

  it('rechaza precio negativo', () => {
    const result = productSchema.safeParse({ ...valid, unitPrice: -100 });
    expect(result.success).toBe(false);
  });

  it('acepta precio cero', () => {
    expect(productSchema.safeParse({ ...valid, unitPrice: 0 }).success).toBe(true);
  });

  it('rechaza stock negativo', () => {
    const result = productSchema.safeParse({ ...valid, stock: -5 });
    expect(result.success).toBe(false);
  });

  it('rechaza categoría inválida', () => {
    const result = productSchema.safeParse({ ...valid, category: 'comida_rapida' });
    expect(result.success).toBe(false);
  });
});

// ── medicalRecordSchema ───────────────────────────────────────────────────────
describe('medicalRecordSchema', () => {
  const valid = {
    patientId: 1,
    veterinarianId: 'vet-1',
    date: '2026-03-15',
    reason: 'Revisión general',
  };

  it('acepta registro médico válido', () => {
    expect(medicalRecordSchema.safeParse(valid).success).toBe(true);
  });

  it('requiere reason', () => {
    const result = medicalRecordSchema.safeParse({ ...valid, reason: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain('reason');
  });

  it('rechaza reason mayor a 500 caracteres', () => {
    const result = medicalRecordSchema.safeParse({ ...valid, reason: 'A'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('requiere patientId positivo', () => {
    const result = medicalRecordSchema.safeParse({ ...valid, patientId: 0 });
    expect(result.success).toBe(false);
  });
});

// ── invoiceSchema ─────────────────────────────────────────────────────────────
describe('invoiceSchema', () => {
  const validItem = { description: 'Consulta general', quantity: 1, unitPrice: 15000 };
  const valid = { ownerId: 1, items: [validItem] };

  it('acepta factura válida', () => {
    expect(invoiceSchema.safeParse(valid).success).toBe(true);
  });

  it('requiere al menos un item', () => {
    const result = invoiceSchema.safeParse({ ...valid, items: [] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain('items');
  });

  it('rechaza taxRate mayor a 100', () => {
    const result = invoiceSchema.safeParse({ ...valid, taxRate: 101 });
    expect(result.success).toBe(false);
  });

  it('rechaza taxRate negativo', () => {
    const result = invoiceSchema.safeParse({ ...valid, taxRate: -1 });
    expect(result.success).toBe(false);
  });

  it('rechaza item sin descripción', () => {
    const result = invoiceSchema.safeParse({
      ...valid,
      items: [{ description: '', quantity: 1, unitPrice: 100 }],
    });
    expect(result.success).toBe(false);
  });

  it('rechaza item con cantidad negativa', () => {
    const result = invoiceSchema.safeParse({
      ...valid,
      items: [{ ...validItem, quantity: -1 }],
    });
    expect(result.success).toBe(false);
  });
});

// ── prescriptionSchema ────────────────────────────────────────────────────────
describe('prescriptionSchema', () => {
  const validItem = { medicationName: 'Amoxicilina 500mg' };
  const valid = {
    patientId: 1,
    veterinarianId: 'vet-1',
    date: '2026-03-15',
    items: [validItem],
  };

  it('acepta receta válida', () => {
    expect(prescriptionSchema.safeParse(valid).success).toBe(true);
  });

  it('requiere al menos un medicamento', () => {
    const result = prescriptionSchema.safeParse({ ...valid, items: [] });
    expect(result.success).toBe(false);
  });

  it('requiere nombre del medicamento', () => {
    const result = prescriptionSchema.safeParse({
      ...valid,
      items: [{ medicationName: '' }],
    });
    expect(result.success).toBe(false);
  });
});

// ── stockMovementSchema ───────────────────────────────────────────────────────
describe('stockMovementSchema', () => {
  it('acepta movimiento de entrada válido', () => {
    const result = stockMovementSchema.safeParse({
      productId: 1,
      type: 'entrada',
      quantity: 10,
    });
    expect(result.success).toBe(true);
  });

  it('rechaza cantidad cero', () => {
    const result = stockMovementSchema.safeParse({
      productId: 1,
      type: 'entrada',
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rechaza tipo inválido', () => {
    const result = stockMovementSchema.safeParse({
      productId: 1,
      type: 'robo',
      quantity: 5,
    });
    expect(result.success).toBe(false);
  });
});

// ── Update schemas (seguridad PUT endpoints) ──────────────────────────────────
describe('patientSchema — validación de foto', () => {
  it('acepta foto con prefijo data:image/', () => {
    const result = patientSchema.safeParse({
      ownerId: 1, name: 'Rex', species: 'perro', sex: 'macho',
      photo: 'data:image/jpeg;base64,/9j/abc123',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza foto mayor a 700.000 caracteres', () => {
    const result = patientSchema.safeParse({
      ownerId: 1, name: 'Rex', species: 'perro', sex: 'macho',
      photo: 'data:image/jpeg;base64,' + 'A'.repeat(700_001),
    });
    expect(result.success).toBe(false);
  });

  it('rechaza foto sin prefijo data:image/', () => {
    const result = patientSchema.safeParse({
      ownerId: 1, name: 'Rex', species: 'perro', sex: 'macho',
      photo: 'http://evil.com/script.js',
    });
    expect(result.success).toBe(false);
  });
});

describe('patientUpdateSchema', () => {
  it('acepta objeto vacío (todos los campos son opcionales)', () => {
    expect(patientUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('rechaza species inválida aunque sea opcional', () => {
    expect(patientUpdateSchema.safeParse({ species: 'dragon' }).success).toBe(false);
  });

  it('rechaza sex inválido', () => {
    expect(patientUpdateSchema.safeParse({ sex: 'unknown_sex' }).success).toBe(false);
  });

  it('rechaza foto mayor a 700KB', () => {
    const big = 'data:image/jpeg;base64,' + 'A'.repeat(700_001);
    expect(patientUpdateSchema.safeParse({ photo: big }).success).toBe(false);
  });
});

describe('appointmentUpdateSchema', () => {
  it('acepta objeto vacío', () => {
    expect(appointmentUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('rechaza status fuera del enum', () => {
    expect(appointmentUpdateSchema.safeParse({ status: 'hacked' }).success).toBe(false);
  });

  it('rechaza type fuera del enum', () => {
    expect(appointmentUpdateSchema.safeParse({ type: 'invalid_type' }).success).toBe(false);
  });

  it('acepta actualización parcial válida', () => {
    expect(appointmentUpdateSchema.safeParse({ status: 'completada', notes: 'Todo bien' }).success).toBe(true);
  });
});

describe('userUpdateSchema', () => {
  it('rechaza contraseña menor a 8 caracteres', () => {
    expect(userUpdateSchema.safeParse({ password: '123' }).success).toBe(false);
  });

  it('rechaza rol inválido', () => {
    expect(userUpdateSchema.safeParse({ role: 'superadmin' }).success).toBe(false);
  });

  it('rechaza email con formato inválido', () => {
    expect(userUpdateSchema.safeParse({ email: 'no-es-email' }).success).toBe(false);
  });

  it('acepta contraseña válida de 8+ caracteres', () => {
    expect(userUpdateSchema.safeParse({ password: 'segura123' }).success).toBe(true);
  });

  it('acepta objeto vacío', () => {
    expect(userUpdateSchema.safeParse({}).success).toBe(true);
  });
});

describe('invoiceUpdateSchema', () => {
  it('rechaza status no listado', () => {
    expect(invoiceUpdateSchema.safeParse({ status: 'pendiente_fake' }).success).toBe(false);
  });

  it('acepta status válido', () => {
    expect(invoiceUpdateSchema.safeParse({ status: 'pagada' }).success).toBe(true);
  });
});

describe('prescriptionUpdateSchema', () => {
  it('rechaza status inválido', () => {
    expect(prescriptionUpdateSchema.safeParse({ status: 'borrado' }).success).toBe(false);
  });

  it('acepta status válido', () => {
    expect(prescriptionUpdateSchema.safeParse({ status: 'completada' }).success).toBe(true);
  });
});

describe('labOrderUpdateSchema', () => {
  it('rechaza status inválido', () => {
    expect(labOrderUpdateSchema.safeParse({ status: 'fake' }).success).toBe(false);
  });

  it('rechaza results mayor a 2000 caracteres', () => {
    expect(labOrderUpdateSchema.safeParse({ results: 'X'.repeat(2001) }).success).toBe(false);
  });

  it('acepta status válido con results', () => {
    expect(labOrderUpdateSchema.safeParse({ status: 'completado', results: 'Normal' }).success).toBe(true);
  });
});
