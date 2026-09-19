import { z } from 'zod';
import type { VisitOperation } from './visit-types';

export const visitOperationSchema = z.object({
  id: z.string().uuid(), visitId: z.number().int().positive(), expectedUpdatedAt: z.string().datetime(),
  predecessorId: z.string().uuid().optional(),
  // Formato del payload. Ausente = 1 (dispositivos con cola anterior a
  // las prestaciones del catálogo); el servidor acepta ambos.
  version: z.literal(2).optional(),
  // Hora declarada por el dispositivo. Se guarda marcada como tal: el
  // reloj del teléfono no ordena decisiones de inventario ni de dinero.
  occurredAt: z.string().datetime().optional(),
  action: z.enum(['travel', 'start', 'save', 'complete']),
  record: z.object({
    reason: z.string().trim().min(1).max(255), subjective: z.string().max(2000).optional(),
    diagnosis: z.string().max(2000).optional(), treatment: z.string().max(2000).optional(), observations: z.string().max(2000).optional(),
    vitalSigns: z.object({ temperature: z.number().finite().positive().max(60).optional(), heartRate: z.number().int().positive().max(500).optional(), weight: z.number().finite().positive().max(999).optional(), respiratoryRate: z.number().int().positive().max(500).optional() }).optional(),
    supplies: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().finite().min(0.001).multipleOf(0.001), locationId: z.number().int().positive().nullable().optional() })).max(50).optional(),
    photos: z.array(z.string().max(700000).regex(/^data:image\/(jpeg|png|webp);base64,/)).max(6).optional(),
    templateId: z.number().int().positive().optional(),
    templateVersion: z.number().int().positive().optional(),
    amendsRecordId: z.number().int().positive().optional(),
  }).optional(),
  items: z.array(z.object({
    serviceId: z.number().int().positive(),
    // Entera a propósito: la línea de cobro guarda la cantidad como entero,
    // y una fracción dejaría cantidad y subtotal contradiciéndose en el
    // mismo documento. El consumo fraccionario vive en los insumos de la
    // prestación, no en cuántas veces se realizó.
    quantity: z.number().int().positive().max(999),
  })).min(1).max(30).optional(),
  charge: z.object({ description: z.string().trim().min(1).max(255), amount: z.number().finite().positive().max(999999999) }).optional(),
  payment: z.object({ amount: z.number().finite().positive().max(999999999), method: z.enum(['efectivo', 'transferencia', 'tarjeta', 'otro']), reference: z.string().max(100).optional() }).optional(),
  noCharge: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (['travel', 'start'].includes(value.action) && (value.record || value.charge || value.payment || value.items)) ctx.addIssue({ code: 'custom', message: 'Iniciar o ir a la visita no registra consulta ni cobros' });
  if (value.noCharge && (value.charge || value.payment || value.items)) ctx.addIssue({ code: 'custom', message: 'Una visita sin cobro no puede incluir un pago' });
  // Dos caminos para lo mismo generarían dos cobros por una sola atención.
  if (value.charge && value.items) ctx.addIssue({ code: 'custom', message: 'Usa prestaciones del catálogo o un monto libre, no ambos' });
  if (value.items && new Set(value.items.map((i) => i.serviceId)).size !== value.items.length) ctx.addIssue({ code: 'custom', message: 'Cada prestación debe aparecer una sola vez, con su cantidad' });
});

export class VisitError extends Error { constructor(public status: number, message: string) { super(message); } }

export function validateVisitChange(operation: VisitOperation, visit: { status: string; updatedAt: Date | string }, hasRecord: boolean, hasInvoice: boolean) {
  if (new Date(visit.updatedAt).toISOString() !== operation.expectedUpdatedAt) throw new VisitError(409, 'La visita cambió en otro dispositivo. Revisa la versión actual antes de reintentar.');
  if (['cancelada', 'no_asistio'].includes(visit.status)) throw new VisitError(409, 'Esta visita está cancelada o marcada como no realizada.');
  // Una visita cerrada admite exactamente una escritura clínica: la adenda
  // que corrige una nota anterior. Cualquier otra nota nueva sobre una
  // atención ya cerrada sería reabrirla por la puerta de atrás.
  if (visit.status === 'completada' && operation.record && !operation.record.amendsRecordId) throw new VisitError(409, 'La visita ya está cerrada. Para corregir la nota, registra una adenda sobre el registro existente.');
  if (visit.status === 'completada' && ['travel', 'start'].includes(operation.action)) throw new VisitError(409, 'La visita ya está cerrada. Puedes registrar su cobro pendiente.');
  // Una adenda corrige texto. Mover stock después del cierre exige un
  // movimiento compensatorio explícito desde inventario, no un descuento
  // escondido dentro de una corrección de redacción.
  if (operation.record?.amendsRecordId && operation.record.supplies?.length) throw new VisitError(400, 'Una adenda no descuenta insumos. Registra el movimiento de stock desde el botiquín.');
  if (operation.action === 'travel' && visit.status === 'en_curso') throw new VisitError(409, 'La atención ya comenzó.');
  if (operation.action === 'complete' && !hasRecord && !operation.record) throw new VisitError(400, 'Registra la consulta antes de cerrar la visita.');
  if (operation.action === 'complete' && !hasInvoice && !operation.charge && !operation.noCharge) throw new VisitError(400, 'Añade el cobro o indica que esta atención no tiene costo.');
  if (operation.charge && hasInvoice) throw new VisitError(409, 'La visita ya tiene un cobro. Registra el pago sobre ese saldo.');
}
