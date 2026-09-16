import { z } from 'zod';
import type { VisitOperation } from './visit-types';

export const visitOperationSchema = z.object({
  id: z.string().uuid(), visitId: z.number().int().positive(), expectedUpdatedAt: z.string().datetime(),
  predecessorId: z.string().uuid().optional(),
  action: z.enum(['travel', 'start', 'save', 'complete']),
  record: z.object({
    reason: z.string().trim().min(1).max(255), subjective: z.string().max(2000).optional(),
    diagnosis: z.string().max(2000).optional(), treatment: z.string().max(2000).optional(), observations: z.string().max(2000).optional(),
    vitalSigns: z.object({ temperature: z.number().finite().positive().max(60).optional(), heartRate: z.number().int().positive().max(500).optional(), weight: z.number().finite().positive().max(999).optional(), respiratoryRate: z.number().int().positive().max(500).optional() }).optional(),
    supplies: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().finite().min(0.001).multipleOf(0.001), locationId: z.number().int().positive().nullable().optional() })).max(50).optional(),
    photos: z.array(z.string().max(700000).regex(/^data:image\/(jpeg|png|webp);base64,/)).max(6).optional(),
  }).optional(),
  charge: z.object({ description: z.string().trim().min(1).max(255), amount: z.number().finite().positive().max(999999999) }).optional(),
  payment: z.object({ amount: z.number().finite().positive().max(999999999), method: z.enum(['efectivo', 'transferencia', 'tarjeta', 'otro']), reference: z.string().max(100).optional() }).optional(),
  noCharge: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (['travel', 'start'].includes(value.action) && (value.record || value.charge || value.payment)) ctx.addIssue({ code: 'custom', message: 'Iniciar o ir a la visita no registra consulta ni cobros' });
  if (value.noCharge && (value.charge || value.payment)) ctx.addIssue({ code: 'custom', message: 'Una visita sin cobro no puede incluir un pago' });
});

export class VisitError extends Error { constructor(public status: number, message: string) { super(message); } }

export function validateVisitChange(operation: VisitOperation, visit: { status: string; updatedAt: Date | string }, hasRecord: boolean, hasInvoice: boolean) {
  if (new Date(visit.updatedAt).toISOString() !== operation.expectedUpdatedAt) throw new VisitError(409, 'La visita cambió en otro dispositivo. Revisa la versión actual antes de reintentar.');
  if (['cancelada', 'no_asistio'].includes(visit.status)) throw new VisitError(409, 'Esta visita está cancelada o marcada como no realizada.');
  if (visit.status === 'completada' && (operation.record || ['travel', 'start'].includes(operation.action))) throw new VisitError(409, 'La visita ya está cerrada. Puedes registrar su cobro pendiente.');
  if (operation.action === 'travel' && visit.status === 'en_curso') throw new VisitError(409, 'La atención ya comenzó.');
  if (operation.action === 'complete' && !hasRecord && !operation.record) throw new VisitError(400, 'Registra la consulta antes de cerrar la visita.');
  if (operation.action === 'complete' && !hasInvoice && !operation.charge && !operation.noCharge) throw new VisitError(400, 'Añade el cobro o indica que esta atención no tiene costo.');
  if (operation.charge && hasInvoice) throw new VisitError(409, 'La visita ya tiene un cobro. Registra el pago sobre ese saldo.');
}
