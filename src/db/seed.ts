import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { users } from './schema/users';
import { owners, patients } from './schema/patients';
import { products, stockMovements } from './schema/inventory';
import { appointments } from './schema/appointments';
import { medicalRecords, vaccines } from './schema/medical';
import { prescriptions, prescriptionItems, labOrders } from './schema/prescriptions';
import { invoices, invoiceItems, payments } from './schema/billing';
import { eq } from 'drizzle-orm';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function daysAgo(n: number): Date {
  return daysFromNow(-n);
}

function atHour(date: Date, h: number, m = 0): Date {
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

// Formato YYYY-MM-DD para columnas `date` de Postgres
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function seed() {
  const connection = postgres(process.env.DIRECT_URL || process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(connection);

  // ── Idempotency guard ─────────────────────────────────────────────────────
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, 'admin@vetclinic.com'));
  if (existing.length > 0) {
    console.log('⚠️  Seed data already exists. Delete users first to re-seed.');
    await connection.end();
    process.exit(0);
  }

  console.log('🌱 Seeding database...');

  // ── USERS ─────────────────────────────────────────────────────────────────
  const adminId = crypto.randomUUID();
  const vetId   = crypto.randomUUID();
  const vet2Id  = crypto.randomUUID();
  const recepId = crypto.randomUUID();

  await db.insert(users).values([
    { id: adminId,   name: 'Admin Sistema',       email: 'admin@vetclinic.com',       emailVerified: true, role: 'admin',         phone: '+506 2222-2222' },
    { id: vetId,     name: 'Dr. Carlos Ramirez',  email: 'veterinario@vetclinic.com', emailVerified: true, role: 'veterinario',   phone: '+506 8888-1111' },
    { id: vet2Id,    name: 'Dra. Sofia Mora',     email: 'vet2@vetclinic.com',        emailVerified: true, role: 'veterinario',   phone: '+506 8888-4444' },
    { id: recepId,   name: 'Maria Lopez',         email: 'recepcion@vetclinic.com',   emailVerified: true, role: 'recepcionista', phone: '+506 8888-2222' },
  ]);
  console.log('✅ Users created.');

  // ── OWNERS ────────────────────────────────────────────────────────────────
  // Los tutores son fichas de cliente sin cuenta de acceso (el portal se retiró).
  const [o1] = await db.insert(owners).values({ firstName: 'Juan',    lastName: 'Perez',    email: 'cliente@vetclinic.com',  phone: '+506 8888-3333', address: 'San José, Costa Rica',   documentId: '1-1234-5678' }).returning();
  const [o2] = await db.insert(owners).values({ firstName: 'Ana',     lastName: 'Martinez', email: 'cliente2@vetclinic.com', phone: '+506 7777-4444', address: 'Heredia, Costa Rica',    documentId: '2-2345-6789' }).returning();
  const [o3] = await db.insert(owners).values({                    firstName: 'Roberto', lastName: 'Vargas',   email: 'roberto@email.com',     phone: '+506 6666-5555', address: 'Alajuela, Costa Rica',   documentId: '3-3456-7890' }).returning();
  const [o4] = await db.insert(owners).values({                    firstName: 'Carmen',  lastName: 'Salazar',  email: 'carmen@email.com',      phone: '+506 5555-6666', address: 'Cartago, Costa Rica',    documentId: '4-4567-8901' }).returning();
  const owner1Id = o1.id;
  const owner2Id = o2.id;
  const owner3Id = o3.id;
  const owner4Id = o4.id;
  console.log('✅ Owners created.');

  // ── PATIENTS ──────────────────────────────────────────────────────────────
  const [p1] = await db.insert(patients).values({ ownerId: owner1Id, name: 'Luna',    species: 'perro', breed: 'Golden Retriever',  color: 'Dorado',                sex: 'hembra', dateOfBirth: '2020-03-13', weight: '28.50', notes: 'Alergica a la penicilina' }).returning();
  const [p2] = await db.insert(patients).values({ ownerId: owner1Id, name: 'Michi',   species: 'gato',  breed: 'Siamés',            color: 'Crema',                 sex: 'macho',  dateOfBirth: '2021-08-20', weight: '4.20' }).returning();
  const [p3] = await db.insert(patients).values({ ownerId: owner2Id, name: 'Rocky',   species: 'perro', breed: 'Bulldog Francés',   color: 'Blanco con manchas',    sex: 'macho',  dateOfBirth: '2019-11-05', weight: '12.00' }).returning();
  const [p4] = await db.insert(patients).values({ ownerId: owner3Id, name: 'Bolt',    species: 'perro', breed: 'Labrador',          color: 'Negro',                 sex: 'macho',  dateOfBirth: '2022-06-01', weight: '22.00' }).returning();
  const [p5] = await db.insert(patients).values({ ownerId: owner3Id, name: 'Pelusa',  species: 'gato',  breed: 'Persa',             color: 'Blanco',                sex: 'hembra', dateOfBirth: '2020-12-15', weight: '3.80' }).returning();
  const [p6] = await db.insert(patients).values({ ownerId: owner4Id, name: 'Coco',    species: 'ave',   breed: 'Loro Amazónico',    color: 'Verde con amarillo',    sex: 'macho',  dateOfBirth: '2018-05-10' }).returning();
  const lunaId  = p1.id;
  const michiId = p2.id;
  const rockyId = p3.id;
  const boltId  = p4.id;
  const pelusaId = p5.id;
  console.log('✅ Patients created.');

  // ── PRODUCTS ──────────────────────────────────────────────────────────────
  const [pr1] = await db.insert(products).values({ name: 'Amoxicilina 500mg',        description: 'Antibiótico de amplio espectro',           category: 'medicamento', sku: 'MED-001', unitPrice: '5500.00',  costPrice: '3200.00',  stock: '100', minStock: '20', unit: 'tableta', supplier: 'Farmacéutica Nacional' }).returning();
  const [pr2] = await db.insert(products).values({ name: 'Vacuna Antirrábica',       description: 'Vacuna contra la rabia',                   category: 'vacuna',      sku: 'VAC-001', unitPrice: '15000.00', costPrice: '8500.00',  stock: '50',  minStock: '10', unit: 'dosis',   supplier: 'BioVet Labs' }).returning();
  const [pr3] = await db.insert(products).values({ name: 'Desparasitante Oral',      description: 'Desparasitante de amplio espectro',        category: 'medicamento', sku: 'MED-002', unitPrice: '8000.00',  costPrice: '4500.00',  stock: '75',  minStock: '15', unit: 'tableta', supplier: 'Farmacéutica Nacional' }).returning();
  const [pr4] = await db.insert(products).values({ name: 'Meloxicam 1mg',            description: 'Antiinflamatorio no esteroideo',           category: 'medicamento', sku: 'MED-003', unitPrice: '3500.00',  costPrice: '1800.00',  stock: '3',   minStock: '10', unit: 'tableta', supplier: 'Farmacéutica Nacional' }).returning();
  const [pr5] = await db.insert(products).values({ name: 'Collar Isabelino M',       description: 'Collar isabelino tamaño mediano',          category: 'accesorio',   sku: 'ACC-001', unitPrice: '3500.00',  costPrice: '1800.00',  stock: '30',  minStock: '5',  unit: 'unidad',  supplier: 'Pet Supplies CR' }).returning();
  const [pr6] = await db.insert(products).values({ name: 'Alimento Premium Perro 15kg', description: 'Alimento premium para perros adultos', category: 'alimento',    sku: 'ALI-001', unitPrice: '25000.00', costPrice: '18000.00', stock: '8',   minStock: '5',  unit: 'bolsa',   supplier: 'Distribuidora Animal' }).returning();
  const [pr7] = await db.insert(products).values({ name: 'Vacuna Polivalente Canina',description: 'Vacuna moquillo, parvovirus, hepatitis',   category: 'vacuna',      sku: 'VAC-002', unitPrice: '18000.00', costPrice: '10000.00', stock: '30',  minStock: '10', unit: 'dosis',   supplier: 'BioVet Labs' }).returning();
  const [pr8] = await db.insert(products).values({ name: 'Otoclean 15ml',            description: 'Solución limpiadora auricular',            category: 'insumo',      sku: 'INS-001', unitPrice: '5000.00',  costPrice: '2500.00',  stock: '2',   minStock: '8',  unit: 'frasco',  supplier: 'VetMed Supplies' }).returning();
  const prod1Id = pr1.id;
  const prod2Id = pr2.id;
  const prod3Id = pr3.id;
  const prod4Id = pr4.id;
  const prod7Id = pr7.id;
  const prod8Id = pr8.id;

  await db.insert(stockMovements).values([
    { productId: prod1Id, type: 'entrada', quantity: '100', reason: 'Inventario inicial', userId: adminId },
    { productId: prod2Id, type: 'entrada', quantity: '50',  reason: 'Inventario inicial', userId: adminId },
    { productId: prod3Id, type: 'entrada', quantity: '75',  reason: 'Inventario inicial', userId: adminId },
    { productId: prod4Id, type: 'entrada', quantity: '20',  reason: 'Inventario inicial', userId: adminId },
    { productId: prod7Id, type: 'entrada', quantity: '30',  reason: 'Inventario inicial', userId: adminId },
    { productId: prod8Id, type: 'entrada', quantity: '15',  reason: 'Inventario inicial', userId: adminId },
    { productId: pr5.id, type: 'entrada', quantity: '30', reason: 'Inventario inicial', userId: adminId },
    { productId: pr6.id, type: 'entrada', quantity: '15', reason: 'Inventario inicial', userId: adminId },
  ]);
  console.log('✅ Products + stock movements created.');

  // ── VACCINES ──────────────────────────────────────────────────────────────
  // Mezcla de: vencidas, próximas (para widget) y lejanas
  await db.insert(vaccines).values([
    // Luna — antirrábica vencida hace 1 semana
    { patientId: lunaId,   veterinarianId: vetId,  name: 'Antirrábica',          brand: 'Nobivac Rabies',  batchNumber: 'RAB-2024-001', applicationDate: iso(daysAgo(372)), nextDoseDate: iso(daysAgo(7)),  notes: 'Sin reacciones' },
    // Luna — polivalente vence en 5 días (PRONTO)
    { patientId: lunaId,   veterinarianId: vetId,  name: 'Polivalente Canina',   brand: 'Vanguard Plus 5', batchNumber: 'POL-2024-002', applicationDate: iso(daysAgo(360)), nextDoseDate: iso(daysFromNow(5)) },
    // Michi — trivalente felina vence en 12 días
    { patientId: michiId,  veterinarianId: vetId,  name: 'Trivalente Felina',    brand: 'Felovax IV',      batchNumber: 'FEL-2024-003', applicationDate: iso(daysAgo(353)), nextDoseDate: iso(daysFromNow(12)) },
    // Rocky — antirrábica vence en 25 días
    { patientId: rockyId,  veterinarianId: vet2Id, name: 'Antirrábica',          brand: 'Rabisin',         batchNumber: 'RAB-2024-004', applicationDate: iso(daysAgo(340)), nextDoseDate: iso(daysFromNow(25)) },
    // Bolt — polivalente vencida hace 3 días
    { patientId: boltId,   veterinarianId: vetId,  name: 'Polivalente Canina',   brand: 'Vanguard Plus 5', batchNumber: 'POL-2024-005', applicationDate: iso(daysAgo(368)), nextDoseDate: iso(daysAgo(3)) },
    // Pelusa — leucemia felina vence en 18 días
    { patientId: pelusaId, veterinarianId: vet2Id, name: 'Leucemia Felina',      brand: 'Purevax',         batchNumber: 'LEU-2024-006', applicationDate: iso(daysAgo(347)), nextDoseDate: iso(daysFromNow(18)) },
    // Bolt — antirrábica futura (90 días)
    { patientId: boltId,   veterinarianId: vetId,  name: 'Antirrábica',          brand: 'Nobivac Rabies',  batchNumber: 'RAB-2025-007', applicationDate: iso(daysAgo(10)),  nextDoseDate: iso(daysFromNow(355)) },
  ]);
  console.log('✅ Vaccines created.');

  // ── APPOINTMENTS ──────────────────────────────────────────────────────────
  // Citas pasadas + hoy + futuras para calendario y reportes
  const [a1] = await db.insert(appointments).values({
    patientId: lunaId,  ownerId: owner1Id, veterinarianId: vetId,
    scheduledAt: atHour(daysAgo(2), 10),  endAt: atHour(daysAgo(2), 10, 30),
    type: 'consulta', status: 'completada', reason: 'Revisión general y vacunación anual',
  }).returning();
  const appt1Id = a1.id;

  await db.insert(appointments).values({
    patientId: rockyId, ownerId: owner2Id, veterinarianId: vet2Id,
    scheduledAt: atHour(daysAgo(5), 11),  endAt: atHour(daysAgo(5), 11, 30),
    type: 'consulta', status: 'completada', reason: 'Consulta por otitis',
  });

  await db.insert(appointments).values({
    patientId: boltId,  ownerId: owner3Id, veterinarianId: vetId,
    scheduledAt: atHour(daysAgo(10), 9),  endAt: atHour(daysAgo(10), 9, 30),
    type: 'vacunacion', status: 'completada', reason: 'Vacuna polivalente',
  });

  await db.insert(appointments).values({
    patientId: pelusaId, ownerId: owner3Id, veterinarianId: vet2Id,
    scheduledAt: atHour(daysAgo(15), 14), endAt: atHour(daysAgo(15), 14, 30),
    type: 'control', status: 'completada', reason: 'Control post-esterilización',
  });

  await db.insert(appointments).values({
    patientId: lunaId,  ownerId: owner1Id, veterinarianId: vetId,
    scheduledAt: atHour(daysAgo(30), 10), endAt: atHour(daysAgo(30), 10, 30),
    type: 'grooming', status: 'completada', reason: 'Baño y corte',
  });

  // Cita en curso hoy
  await db.insert(appointments).values({
    patientId: michiId, ownerId: owner1Id, veterinarianId: vetId,
    scheduledAt: atHour(new Date(), 8),   endAt: atHour(new Date(), 8, 30),
    type: 'consulta', status: 'en_curso', reason: 'Pérdida de apetito',
  });

  // Citas futuras
  await db.insert(appointments).values({
    patientId: michiId, ownerId: owner1Id, veterinarianId: vetId,
    scheduledAt: atHour(daysFromNow(1), 9),  endAt: atHour(daysFromNow(1), 9, 30),
    type: 'vacunacion', status: 'confirmada', reason: 'Vacuna trivalente felina',
  });
  await db.insert(appointments).values({
    patientId: rockyId, ownerId: owner2Id, veterinarianId: vet2Id,
    scheduledAt: atHour(daysFromNow(3), 11), endAt: atHour(daysFromNow(3), 11, 30),
    type: 'control', status: 'programada', reason: 'Control postoperatorio',
  });
  await db.insert(appointments).values({
    patientId: boltId,  ownerId: owner3Id, veterinarianId: vetId,
    scheduledAt: atHour(daysFromNow(7), 10), endAt: atHour(daysFromNow(7), 10, 30),
    type: 'consulta', status: 'programada', reason: 'Revisión piel',
  });
  await db.insert(appointments).values({
    patientId: lunaId,  ownerId: owner1Id, veterinarianId: vet2Id,
    scheduledAt: atHour(daysFromNow(5), 14), endAt: atHour(daysFromNow(5), 15),
    type: 'cirugia', status: 'confirmada', reason: 'Extracción dental', visitAddress: 'San José, Barrio Escalante 200m norte del parque',
  });
  console.log('✅ Appointments created.');

  // ── MEDICAL RECORDS ───────────────────────────────────────────────────────
  const [mr1] = await db.insert(medicalRecords).values({
    patientId: lunaId,  veterinarianId: vetId, appointmentId: appt1Id,
    date: atHour(daysAgo(2), 10),
    reason: 'Revisión general y vacunación anual',
    diagnosis: 'Paciente en buen estado general. Leve sobrepeso.',
    treatment: 'Vacunación antirrábica y polivalente. Dieta controlada.',
    observations: 'Recomendar actividad física. Próximo control en 6 meses.',
    vitalSigns: { temperature: 38.5, heartRate: 72, weight: 28.5, respiratoryRate: 18 },
  }).returning();
  const rec1Id = mr1.id;

  const [mr2] = await db.insert(medicalRecords).values({
    patientId: rockyId, veterinarianId: vet2Id,
    date: atHour(daysAgo(5), 11),
    reason: 'Consulta por otitis',
    diagnosis: 'Otitis externa bilateral por Malassezia',
    treatment: 'Limpieza auricular + Otoclean 2 veces al día × 10 días. Meloxicam 1mg/kg.',
    observations: 'Revisar en 10 días para evaluar respuesta al tratamiento.',
    vitalSigns: { temperature: 39.0, heartRate: 80, weight: 12.0, respiratoryRate: 20 },
  }).returning();
  const rec2Id = mr2.id;

  await db.insert(medicalRecords).values({
    patientId: boltId, veterinarianId: vetId,
    date: atHour(daysAgo(10), 9),
    reason: 'Consulta preventiva + vacunación',
    diagnosis: 'Paciente sano. Vacuna polivalente aplicada.',
    treatment: 'Vacunación y desparasitación oral.',
    vitalSigns: { temperature: 38.3, heartRate: 75, weight: 22.0, respiratoryRate: 16 },
  });

  console.log('✅ Medical records created.');

  // ── PRESCRIPTIONS ─────────────────────────────────────────────────────────
  const [rx1] = await db.insert(prescriptions).values({
    patientId: lunaId,  veterinarianId: vetId, medicalRecordId: rec1Id,
    date: atHour(daysAgo(2), 10, 30),
    notes: 'Administrar con alimento para evitar irritación gástrica.',
    status: 'activa',
  }).returning();
  const rx1Id = rx1.id;
  await db.insert(prescriptionItems).values([
    { prescriptionId: rx1Id, productId: prod3Id, medicationName: 'Desparasitante Oral', dosage: '1 tableta', frequency: 'Dosis única', duration: '1 día', instructions: 'Administrar en ayunas', quantity: 1 },
  ]);

  const [rx2] = await db.insert(prescriptions).values({
    patientId: rockyId, veterinarianId: vet2Id, medicalRecordId: rec2Id,
    date: atHour(daysAgo(5), 11, 30),
    notes: 'Control en 10 días.',
    status: 'completada',
  }).returning();
  const rx2Id = rx2.id;
  await db.insert(prescriptionItems).values([
    { prescriptionId: rx2Id, medicationName: 'Otoclean', dosage: '5 gotas por oído', frequency: '2 veces al día', duration: '10 días', instructions: 'Limpiar con gasa antes de aplicar', quantity: 1 },
    { prescriptionId: rx2Id, productId: prod4Id, medicationName: 'Meloxicam 1mg', dosage: '1mg/kg', frequency: '1 vez al día', duration: '5 días', instructions: 'Administrar con alimento', quantity: 5 },
  ]);
  console.log('✅ Prescriptions created.');

  // ── LAB ORDERS ────────────────────────────────────────────────────────────
  await db.insert(labOrders).values([
    {
      patientId: lunaId, veterinarianId: vetId, medicalRecordId: rec1Id,
      type: 'hemograma', description: 'Hemograma completo de control anual.',
      status: 'completado',
      results: 'Eritrocitos: 6.2M/µL. Leucocitos: 8,400/µL. Plaquetas: 280,000/µL. Parámetros dentro de rangos normales.',
      requestedAt: atHour(daysAgo(2), 10, 45), completedAt: atHour(daysAgo(2), 14),
    },
    {
      patientId: rockyId, veterinarianId: vet2Id, medicalRecordId: rec2Id,
      type: 'cultivo', description: 'Cultivo de secreción auricular.',
      status: 'en_proceso',
      requestedAt: atHour(daysAgo(5), 11, 30),
    },
  ]);
  console.log('✅ Lab orders created.');

  // ── INVOICES ──────────────────────────────────────────────────────────────
  // Helper: inserta factura + ítems + pago opcional
  async function createInvoice(
    num: string, ownerId: number, date: Date,
    items: { desc: string; qty: number; price: number; productId?: number }[],
    status: 'borrador' | 'emitida' | 'pagada' | 'parcial' | 'anulada',
    notes: string,
    paidAmount?: number,
    method: 'efectivo' | 'tarjeta' | 'transferencia' = 'efectivo',
  ) {
    const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
    const taxAmt   = Math.round(subtotal * 0.13);
    const total    = subtotal + taxAmt;
    const [inv] = await db.insert(invoices).values({
      invoiceNumber: num, ownerId, date,
      subtotal: subtotal.toFixed(2), taxRate: '13.00',
      taxAmount: taxAmt.toFixed(2), discount: '0.00',
      total: total.toFixed(2), status, notes, createdBy: recepId,
    }).returning();
    const invId = inv.id;
    await db.insert(invoiceItems).values(
      items.map((i) => ({ invoiceId: invId, productId: i.productId, description: i.desc, quantity: i.qty, unitPrice: i.price.toFixed(2), subtotal: (i.qty * i.price).toFixed(2) })),
    );
    if (paidAmount !== undefined) {
      await db.insert(payments).values({ invoiceId: invId, amount: paidAmount.toFixed(2), method, date, receivedBy: recepId });
    }
    return invId;
  }

  await createInvoice('FAC-000001', owner1Id, atHour(daysAgo(2), 11),
    [{ desc: 'Consulta general', qty: 1, price: 15000 }, { desc: 'Vacuna Antirrábica', qty: 1, price: 15000, productId: prod2Id }, { desc: 'Desparasitante Oral', qty: 1, price: 8000, productId: prod3Id }],
    'pagada', 'Consulta + vacunas anuales Luna', 42940, 'efectivo');

  await createInvoice('FAC-000002', owner2Id, atHour(daysAgo(5), 10),
    [{ desc: 'Consulta + tratamiento otitis', qty: 1, price: 20000 }, { desc: 'Otoclean 15ml', qty: 1, price: 5000, productId: prod8Id }],
    'parcial', 'Consulta Rocky — otitis', 15000, 'tarjeta');

  await createInvoice('FAC-000003', owner3Id, atHour(daysAgo(10), 9),
    [{ desc: 'Consulta preventiva', qty: 1, price: 12000 }, { desc: 'Vacuna Polivalente Canina', qty: 1, price: 18000, productId: prod7Id }, { desc: 'Desparasitante Oral', qty: 1, price: 8000, productId: prod3Id }],
    'pagada', 'Consulta Bolt vacunación', 42900, 'transferencia');

  await createInvoice('FAC-000004', owner1Id, atHour(daysAgo(20), 11),
    [{ desc: 'Grooming — baño y corte', qty: 1, price: 18000 }],
    'pagada', 'Grooming Luna', 20340, 'efectivo');

  await createInvoice('FAC-000005', owner3Id, atHour(daysAgo(22), 14),
    [{ desc: 'Consulta + esterilización felina', qty: 1, price: 45000 }, { desc: 'Collar Isabelino M', qty: 1, price: 3500, productId: pr5.id }],
    'pagada', 'Esterilización Pelusa', 54735, 'tarjeta');

  await createInvoice('FAC-000006', owner4Id, atHour(daysAgo(8), 10),
    [{ desc: 'Consulta exóticos — loro', qty: 1, price: 20000 }],
    'emitida', 'Consulta Coco');

  await createInvoice('FAC-000007', owner1Id, atHour(new Date(), 8),
    [{ desc: 'Consulta urgente', qty: 1, price: 15000 }, { desc: 'Amoxicilina 500mg x10', qty: 10, price: 5500, productId: prod1Id }],
    'borrador', 'Consulta Michi hoy');

  console.log('✅ Invoices + payments created.');

  console.log('\n🎉 Seed completado!');
  console.log('\n📋 Cuentas de prueba (usar /registro para establecer contraseña):');
  console.log('   Admin:          admin@vetclinic.com');
  console.log('   Veterinario 1:  veterinario@vetclinic.com');
  console.log('   Veterinario 2:  vet2@vetclinic.com');
  console.log('   Recepcionista:  recepcion@vetclinic.com');
  console.log('   Cliente 1:      cliente@vetclinic.com');
  console.log('   Cliente 2:      cliente2@vetclinic.com');
  console.log('\n🐾 Pacientes: Luna (perro), Michi (gato), Rocky (perro), Bolt (perro), Pelusa (gato), Coco (loro)');
  console.log('💉 Widget de vacunas: Luna (vencida -7d, pronto +5d), Michi (+12d), Rocky (+25d), Bolt (vencida -3d), Pelusa (+18d)');
  console.log('📊 Reportes: 7 facturas en los últimos 30 días');

  await connection.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed falló:', err.message);
  process.exit(1);
});
