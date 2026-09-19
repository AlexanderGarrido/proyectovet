import { fromClinicInput } from './clinic-time';
import type { AppointmentFormData } from './schemas';

export function appointmentRequest(data: AppointmentFormData) {
  return {
    ...data,
    patientId: Number(data.patientId), ownerId: Number(data.ownerId),
    scheduledAt: fromClinicInput(data.scheduledAt), endAt: fromClinicInput(data.endAt),
    // El colchón viaja como número; vacío significa cero, no "sin declarar",
    // porque la validación de solapamiento necesita un valor concreto.
    travelBufferMinutes: Number(data.travelBufferMinutes || 0),
    sector: data.sector?.trim() || null,
  };
}

export function positiveId(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  if (!/^[1-9]\d*$/.test(String(value))) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : undefined;
}

export function safeVisitReturn(value?: string | null): string | undefined {
  return value && /^\/citas\/[1-9]\d*$/.test(value) ? value : undefined;
}

export function readFormContext(params: URLSearchParams) {
  return {
    patientId: positiveId(params.get('patientId')),
    appointmentId: positiveId(params.get('appointmentId')),
    ownerId: positiveId(params.get('ownerId')),
    returnTo: safeVisitReturn(params.get('returnTo')),
  };
}

export function verifyInvoiceContext(
  appointment: { ownerId: number; patientId: number },
  context: { ownerId?: number; patientId?: number },
): void {
  if (context.ownerId !== undefined && context.ownerId !== appointment.ownerId)
    throw new Error('El responsable no corresponde a la cita');
  if (context.patientId !== undefined && context.patientId !== appointment.patientId)
    throw new Error('El paciente no corresponde a la cita');
}

export async function fetchFormData<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('No se pudieron cargar los datos. Intenta nuevamente.');
  return response.json();
}

/** Include a contextual record even when it is outside the first list page. */
export async function fetchFormChoices<T extends { id: number }>(url: string, selectedId?: number): Promise<T[]> {
  const choices = await fetchFormData<T[]>(url);
  if (selectedId && !choices.some((item) => item.id === selectedId)) {
    choices.push(await fetchFormData<T>(`${url}/${selectedId}`));
  }
  return choices;
}

/** Retain the existing selection when an active-only catalog omits it. */
export function preserveFormChoice<T extends { id: string | number }>(choices: T[], selected?: T): T[] {
  return selected && !choices.some((choice) => choice.id === selected.id) ? [...choices, selected] : choices;
}
