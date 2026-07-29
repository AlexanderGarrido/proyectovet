import { z } from 'zod';

// ── Owners ──────────────────────────────────────────────────────────────────
export const ownerSchema = z.object({
  firstName:  z.string().min(1, 'Nombre requerido').max(100),
  lastName:   z.string().min(1, 'Apellido requerido').max(100),
  email:      z.string().email('Email inválido').max(200),
  phone:      z.string().max(20).optional().nullable(),
  address:    z.string().max(300).optional().nullable(),
  documentId: z.string().max(50).optional().nullable(),
});

export type OwnerInput = z.infer<typeof ownerSchema>;

// ── Patients ─────────────────────────────────────────────────────────────────
export const patientSchema = z.object({
  ownerId:         z.number().int().positive('Tutor requerido'),
  name:            z.string().min(1, 'Nombre requerido').max(100),
  species:         z.enum(['perro', 'gato', 'ave', 'conejo', 'reptil', 'roedor', 'otro']),
  breed:           z.string().max(100).optional().nullable(),
  color:           z.string().max(50).optional().nullable(),
  sex:             z.enum(['macho', 'hembra', 'desconocido']).optional().nullable(),
  dateOfBirth:     z.string().optional().nullable(),
  weight:          z.coerce.number().positive().optional().nullable(),
  microchipNumber: z.string().max(50).optional().nullable(),
  photo:           z.string().max(700_000, 'La imagen no puede superar 500KB').refine(val => !val || val.startsWith('data:image/'), 'Formato de imagen inválido').optional().nullable(),
});

export type PatientInput = z.infer<typeof patientSchema>;

// ── Appointments ─────────────────────────────────────────────────────────────
export const appointmentSchema = z.object({
  patientId:       z.number().int().positive('Paciente requerido'),
  ownerId:         z.number().int().positive('Tutor requerido'),
  veterinarianId:  z.string().min(1, 'Veterinario requerido'),
  scheduledAt:     z.string().min(1, 'Fecha requerida'),
  endAt:           z.string().min(1, 'Hora de fin requerida'),
  type:            z.enum(['consulta', 'vacunacion', 'cirugia', 'control', 'emergencia', 'desparasitacion', 'grooming']),
  reason:          z.string().max(500).optional().nullable(),
  notes:           z.string().max(1000).optional().nullable(),
  // SEGURIDAD: antes se leía del body crudo sin pasar por Zod (sin límite de
  // longitud ni tipo). Es el campo central de la atención a domicilio.
  visitAddress:    z.string().max(500).optional().nullable(),
}).refine(data => new Date(data.endAt) > new Date(data.scheduledAt), {
  message: 'La hora de fin debe ser posterior a la de inicio',
  path: ['endAt'],
});

export const appointmentStatusSchema = z.object({
  status: z.enum(['programada', 'confirmada', 'en_camino', 'en_curso', 'completada', 'cancelada', 'no_asistio']),
});

export type AppointmentInput = z.infer<typeof appointmentSchema>;

// ── Medical Records ──────────────────────────────────────────────────────────
export const medicalRecordSchema = z.object({
  patientId:      z.number().int().positive(),
  veterinarianId: z.string().min(1),
  appointmentId:  z.number().int().positive().optional().nullable(),
  date:           z.string().min(1),
  reason:         z.string().min(1, 'Motivo requerido').max(500),
  subjective:     z.string().max(2000).optional().nullable(),
  diagnosis:      z.string().max(500).optional().nullable(),
  treatment:      z.string().max(1000).optional().nullable(),
  observations:   z.string().max(1000).optional().nullable(),
});

export type MedicalRecordInput = z.infer<typeof medicalRecordSchema>;

// ── Prescriptions ─────────────────────────────────────────────────────────────
export const prescriptionItemSchema = z.object({
  medicationName: z.string().min(1, 'Nombre del medicamento requerido').max(200),
  dosage:         z.string().max(100).optional().nullable(),
  frequency:      z.string().max(100).optional().nullable(),
  duration:       z.string().max(100).optional().nullable(),
  quantity:       z.number().int().positive().optional().nullable(),
  productId:      z.number().int().positive().optional().nullable(),
});

export const prescriptionSchema = z.object({
  patientId:       z.number().int().positive(),
  veterinarianId:  z.string().min(1),
  medicalRecordId: z.number().int().positive().optional().nullable(),
  date:            z.string().min(1),
  notes:           z.string().max(1000).optional().nullable(),
  items:           z.array(prescriptionItemSchema).min(1, 'Al menos un medicamento requerido'),
});

export type PrescriptionInput = z.infer<typeof prescriptionSchema>;

// ── Inventory ─────────────────────────────────────────────────────────────────
export const productSchema = z.object({
  name:           z.string().min(1, 'Nombre requerido').max(200),
  category:       z.enum(['medicamento', 'vacuna', 'insumo', 'alimento', 'accesorio', 'otro']),
  sku:            z.string().max(50).optional().nullable(),
  unitPrice:      z.coerce.number().nonnegative('Precio debe ser positivo'),
  costPrice:      z.coerce.number().nonnegative().optional().nullable(),
  stock:          z.coerce.number().nonnegative().default(0),
  minStock:       z.coerce.number().nonnegative().default(5),
  unit:           z.string().max(20).default('unidad'),
  expirationDate: z.string().optional().nullable(),
  supplier:       z.string().max(200).optional().nullable(),
});

export type ProductInput = z.infer<typeof productSchema>;

export const stockMovementSchema = z.object({
  productId:     z.number().int().positive(),
  type:          z.enum(['entrada', 'salida', 'ajuste', 'consumo_interno']),
  quantity:      z.coerce.number().positive('Cantidad debe ser mayor a 0'),
  reason:        z.string().max(300).optional().nullable(),
});

export type StockMovementInput = z.infer<typeof stockMovementSchema>;

// ── Botiquín itinerante (ubicaciones de inventario) ────────────────────────
export const stockLocationSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(100),
  type: z.enum(['central', 'vehiculo']),
  assignedVetId: z.string().min(1).optional().nullable(),
});
export type StockLocationInput = z.infer<typeof stockLocationSchema>;

export const stockTransferSchema = z.object({
  productId: z.number().int().positive(),
  toLocationId: z.number().int().positive(),
  fromLocationId: z.number().int().positive().optional().nullable(),
  quantity: z.coerce.number().positive('Cantidad debe ser mayor a 0'),
});
export type StockTransferInput = z.infer<typeof stockTransferSchema>;

// ── Invoices ──────────────────────────────────────────────────────────────────
export const invoiceItemSchema = z.object({
  description: z.string().min(1, 'Descripción requerida').max(300),
  quantity:    z.coerce.number().positive('Cantidad requerida'),
  unitPrice:   z.coerce.number().nonnegative('Precio requerido'),
  productId:   z.number().int().positive().optional().nullable(),
});

export const invoiceSchema = z.object({
  ownerId:  z.number().int().positive('Tutor requerido'),
  taxRate:  z.number().min(0).max(100).default(0),
  discount: z.number().min(0).default(0),
  notes:    z.string().max(500).optional().nullable(),
  items:    z.array(invoiceItemSchema).min(1, 'Al menos un ítem requerido'),
});

export type InvoiceInput = z.infer<typeof invoiceSchema>;

export const paymentSchema = z.object({
  invoiceId: z.number().int().positive(),
  amount:    z.coerce.number().positive('Monto debe ser mayor a 0'),
  method:    z.enum(['efectivo', 'tarjeta', 'transferencia', 'otro']),
  reference: z.string().max(100).optional().nullable(),
  date:      z.string().min(1),
});

export type PaymentInput = z.infer<typeof paymentSchema>;

// ── Form schemas (string inputs from HTML forms, use z.coerce where needed) ───
// These are used by React form components and share enum values with API schemas.

export const ownerFormSchema = z.object({
  firstName:  z.string().min(1, 'Nombre requerido').max(100),
  lastName:   z.string().min(1, 'Apellido requerido').max(100),
  email:      z.string().email('Email inválido').or(z.literal('')).optional(),
  phone:      z.string().max(20).optional(),
  address:    z.string().max(300).optional(),
  documentId: z.string().max(50).optional(),
});
export type OwnerFormData = z.infer<typeof ownerFormSchema>;

export const patientFormSchema = z.object({
  ownerId:         z.string().min(1, 'Selecciona un tutor'),
  name:            z.string().min(1, 'El nombre es requerido').max(100),
  species:         z.enum(['perro', 'gato', 'ave', 'conejo', 'reptil', 'roedor', 'otro']),
  sex:             z.enum(['macho', 'hembra']),
  breed:           z.string().max(100).optional(),
  color:           z.string().max(50).optional(),
  dateOfBirth:     z.string().optional(),
  weight:          z.union([z.string(), z.number()]).optional().transform(v => v === '' || v === undefined ? undefined : Number(v)),
  microchipNumber: z.string().max(50).optional(),
  notes:           z.string().optional(),
  photo:           z.string().optional().nullable(),
});
export type PatientFormData = z.infer<typeof patientFormSchema>;

export const appointmentFormSchema = z.object({
  patientId:      z.string().min(1, 'Selecciona un paciente'),
  ownerId:        z.string().min(1, 'Requerido'),
  veterinarianId: z.string().min(1, 'Selecciona un veterinario'),
  scheduledAt:    z.string().min(1, 'Fecha y hora requerida'),
  endAt:          z.string().min(1, 'Hora de fin requerida'),
  type:           z.enum(['consulta', 'vacunacion', 'cirugia', 'control', 'emergencia', 'desparasitacion', 'grooming']),
  visitAddress:   z.string().max(500).optional(),
  reason:         z.string().max(500).optional(),
  notes:          z.string().max(1000).optional(),
});
export type AppointmentFormData = z.infer<typeof appointmentFormSchema>;

export const medicalRecordFormSchema = z.object({
  patientId:       z.string().min(1, 'Selecciona un paciente'),
  reason:          z.string().min(1, 'El motivo es requerido'),
  subjective:      z.string().optional(),
  diagnosis:       z.string().optional(),
  treatment:       z.string().optional(),
  observations:    z.string().optional(),
  temperature:     z.string().optional(),
  heartRate:       z.string().optional(),
  weight:          z.string().optional(),
  respiratoryRate: z.string().optional(),
});
export type MedicalRecordFormData = z.infer<typeof medicalRecordFormSchema>;

export const productFormSchema = z.object({
  name:           z.string().min(1, 'Nombre requerido').max(200),
  description:    z.string().optional(),
  category:       z.enum(['medicamento', 'vacuna', 'insumo', 'alimento', 'accesorio', 'otro']),
  sku:            z.string().max(50).optional(),
  barcode:        z.string().max(50).optional(),
  unitPrice:      z.string().min(1, 'Precio requerido'),
  costPrice:      z.string().optional(),
  stock:          z.string().optional(),
  minStock:       z.string().optional(),
  unit:           z.string().max(20).optional(),
  expirationDate: z.string().optional(),
  supplier:       z.string().max(200).optional(),
});
export type ProductFormData = z.infer<typeof productFormSchema>;

// ── Update Schemas (PUT endpoints — all fields optional) ──────────────────────
export const patientUpdateSchema = patientSchema.partial();
export type PatientUpdateInput = z.infer<typeof patientUpdateSchema>;

export const ownerUpdateSchema = ownerSchema.partial();
export type OwnerUpdateInput = z.infer<typeof ownerUpdateSchema>;

export const appointmentUpdateSchema = z.object({
  scheduledAt:   z.string().optional(),
  endAt:         z.string().optional(),
  type:          z.enum(['consulta', 'vacunacion', 'cirugia', 'control', 'emergencia', 'desparasitacion', 'grooming']).optional(),
  status:        z.enum(['programada', 'confirmada', 'en_camino', 'en_curso', 'completada', 'cancelada', 'no_asistio']).optional(),
  reason:        z.string().max(500).optional().nullable(),
  notes:         z.string().max(1000).optional().nullable(),
  veterinarianId: z.string().optional(),
  visitAddress:  z.string().max(500).optional().nullable(),
});
export type AppointmentUpdateInput = z.infer<typeof appointmentUpdateSchema>;

export const productUpdateSchema = productSchema.partial();
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const invoiceUpdateSchema = z.object({
  status: z.enum(['borrador', 'emitida', 'pagada', 'parcial', 'anulada']).optional(),
  notes:  z.string().max(500).optional().nullable(),
});
export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>;

export const prescriptionUpdateSchema = z.object({
  status: z.enum(['activa', 'completada', 'cancelada']).optional(),
  notes:  z.string().max(1000).optional().nullable(),
});
export type PrescriptionUpdateInput = z.infer<typeof prescriptionUpdateSchema>;

// El enum de BD (db/schema/prescriptions.ts labOrderStatusEnum) usa
// "solicitado" como estado inicial — este schema tenía "pendiente", un
// valor que no existe en la BD. Enviar 'solicitado' se rechazaba con 400 y
// no había forma de devolver una orden a su estado inicial.
export const labOrderUpdateSchema = z.object({
  status:  z.enum(['solicitado', 'en_proceso', 'completado', 'cancelado']).optional(),
  results: z.string().max(2000).optional().nullable(),
});
export type LabOrderUpdateInput = z.infer<typeof labOrderUpdateSchema>;

export const userUpdateSchema = z.object({
  name:     z.string().min(1).max(200).optional(),
  email:    z.string().email().optional(),
  role:     z.enum(['admin', 'veterinario', 'recepcionista', 'tutor']).optional(),
  password: z.string().min(8).max(100).optional(),
  isActive: z.boolean().optional(),
});
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

// ── Medical Record Create (POST) ─────────────────────────────────────────────
export const medicalRecordCreateSchema = z.object({
  patientId: z.coerce.number().int().positive(),
  appointmentId: z.coerce.number().int().positive().optional().nullable(),
  date: z.string().optional(),
  reason: z.string().min(1, 'El motivo es requerido').max(500),
  subjective: z.string().max(2000).optional().nullable(),
  diagnosis: z.string().max(2000).optional().nullable(),
  treatment: z.string().max(2000).optional().nullable(),
  observations: z.string().max(2000).optional().nullable(),
  vitalSigns: z.object({
    temperature: z.number().optional(),
    heartRate: z.number().optional(),
    weight: z.number().optional(),
    respiratoryRate: z.number().optional(),
  }).optional().nullable(),
  // Insumos/medicamentos de la clínica consumidos durante esta consulta
  // (ej. 1 ml de un frasco de 100 ml). Descuenta stock automáticamente.
  suppliesUsed: z.array(z.object({
    productId: z.number().int().positive(),
    quantity: z.coerce.number().positive('Cantidad debe ser mayor a 0'),
    // Botiquín itinerante: si se indica, descuenta del stock de esa
    // ubicación (ej. el vehículo del vet) además del total del producto.
    locationId: z.number().int().positive().optional().nullable(),
  })).optional().nullable(),
  // Fotos clínicas tomadas en terreno (lesiones, dermatología, conducta),
  // ya comprimidas del lado del cliente. Mismo límite de tamaño que la foto
  // de perfil de la mascota; hasta 6 por consulta.
  photos: z.array(
    z.string().max(700_000, 'Cada imagen no puede superar 500KB').refine(v => v.startsWith('data:image/'), 'Formato de imagen inválido')
  ).max(6, 'Máximo 6 fotos por consulta').optional().nullable(),
});

// ── Vaccine Create (POST) ────────────────────────────────────────────────────
export const vaccineCreateSchema = z.object({
  patientId: z.coerce.number().int().positive(),
  name: z.string().min(1, 'El nombre es requerido').max(100),
  brand: z.string().max(100).optional().nullable(),
  batchNumber: z.string().max(50).optional().nullable(),
  applicationDate: z.string().min(1, 'La fecha es requerida'),
  nextDoseDate: z.string().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  // Si se vincula a un producto del inventario (categoría "vacuna"), la
  // dosis aplicada descuenta stock automáticamente — antes esto no existía
  // y las vacunas nunca afectaban el inventario.
  productId: z.coerce.number().int().positive().optional().nullable(),
  locationId: z.coerce.number().int().positive().optional().nullable(),
});

// ── Lab Order Create (POST) ──────────────────────────────────────────────────
export const labOrderCreateSchema = z.object({
  patientId: z.coerce.number().int().positive(),
  medicalRecordId: z.coerce.number().int().positive().optional().nullable(),
  type: z.string().min(1, 'El tipo es requerido').max(100),
  description: z.string().max(2000).optional().nullable(),
});

// ── Consentimiento informado (firma digital) ─────────────────────────────────
export const consentFormSchema = z.object({
  patientId: z.coerce.number().int().positive('Paciente requerido'),
  type: z.enum(['cirugia', 'eutanasia', 'anestesia', 'procedimiento', 'otro']),
  description: z.string().min(1, 'Describe el procedimiento').max(2000),
  signedByName: z.string().min(1, 'El nombre de quien firma es requerido').max(200),
  signedByRelation: z.string().max(100).optional().nullable(),
  signature: z.string().min(1, 'La firma es requerida').max(300_000, 'La firma es demasiado pesada').refine(v => v.startsWith('data:image/'), 'Firma inválida'),
});
export type ConsentFormInput = z.infer<typeof consentFormSchema>;

// ── Payment Create (POST) ────────────────────────────────────────────────────
export const paymentCreateSchema = z.object({
  amount: z.coerce.number().positive('El monto debe ser mayor a 0'),
  method: z.enum(['efectivo', 'tarjeta', 'transferencia', 'otro']),
  reference: z.string().max(100).optional().nullable(),
});

// ── Auth: Login ──────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email:    z.string().min(1, 'El correo es requerido').email('Correo inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});
export type LoginFormData = z.infer<typeof loginSchema>;

// ── Auth: Registro ───────────────────────────────────────────────────────────
export const registerSchema = z.object({
  name:            z.string().min(1, 'El nombre es requerido').max(200),
  email:           z.string().min(1, 'El correo es requerido').email('Correo inválido').max(200),
  phone:           z.string().max(30).optional().or(z.literal('')),
  password:        z.string().min(8, 'Mínimo 8 caracteres').max(100),
  confirmPassword: z.string().min(1, 'Confirma la contraseña'),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
});
export type RegisterFormData = z.infer<typeof registerSchema>;

// ── Portal del tutor (self-service) ────────────────────────────────────────────
export const clientProfileSchema = z.object({
  phone: z.string().max(20).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
});
export type ClientProfileInput = z.infer<typeof clientProfileSchema>;

export const clientPetSchema = z.object({
  name:        z.string().min(1, 'Nombre requerido').max(100),
  species:     z.enum(['perro', 'gato', 'ave', 'conejo', 'reptil', 'roedor', 'otro']), // ya alineado con el enum de BD
  sex:         z.enum(['macho', 'hembra', 'desconocido']).optional().nullable(),
  breed:       z.string().max(100).optional().nullable(),
  color:       z.string().max(50).optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  weight:      z.coerce.number().positive().optional().nullable(),
  notes:       z.string().max(2000).optional().nullable(),
});
export type ClientPetInput = z.infer<typeof clientPetSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────
export async function parseJsonBody(request: Request): Promise<{ data: unknown } | { error: Response }> {
  try {
    return { data: await request.json() };
  } catch {
    return { error: new Response(JSON.stringify({ error: 'JSON inválido en el cuerpo de la solicitud' }), { status: 400, headers: { 'Content-Type': 'application/json' } }) };
  }
}

export function zodError(error: z.ZodError) {
  const messages = error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
  return new Response(JSON.stringify({ error: messages }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}
