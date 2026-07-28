import { clinic } from './clinic';

/**
 * Utilidades de WhatsApp para recordatorios "clic-para-enviar" (wa.me).
 * Costo cero: abre el chat con el tutor con el mensaje ya escrito;
 * el personal solo presiona enviar.
 */

/** Prefijo de país por defecto (Chile). Los teléfonos de tutores suelen guardarse como "9 1234 5678" o "+56 9 ...". */
const DEFAULT_COUNTRY_CODE = '56';

/**
 * Normaliza un teléfono a formato E.164 sin "+" (el que exige wa.me).
 * Devuelve null si el número no parece un móvil válido.
 */
export function normalizePhoneForWhatsapp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) return null;

  // Ya viene con código de país chileno: 56 9 XXXX XXXX (11 dígitos).
  if (digits.startsWith(DEFAULT_COUNTRY_CODE) && digits.length === 11) return digits;
  // Móvil chileno sin código de país: 9 XXXX XXXX.
  if (digits.length === 9 && digits.startsWith('9')) return DEFAULT_COUNTRY_CODE + digits;
  // Sin el 9 inicial: XXXX XXXX.
  if (digits.length === 8) return `${DEFAULT_COUNTRY_CODE}9${digits}`;
  // Otro código de país u otro formato largo: se respeta tal cual.
  if (digits.length >= 11) return digits;

  return null;
}

/** Enlace wa.me al chat del tutor con mensaje pre-cargado. Null si el teléfono no es válido. */
export function buildWhatsappLink(phone: string | null | undefined, message: string): string | null {
  const e164 = normalizePhoneForWhatsapp(phone);
  if (!e164) return null;
  return `https://wa.me/${e164}?text=${encodeURIComponent(message)}`;
}

export interface AppointmentReminderMessageData {
  ownerName: string;
  patientName: string;
  /** Fecha ya formateada, ej. "viernes 24 de julio de 2026". */
  appointmentDate: string;
  /** Hora ya formateada, ej. "15:30". */
  appointmentTime: string;
  /** Etiqueta legible del tipo, ej. "Consulta General". */
  appointmentTypeLabel: string;
  veterinarianName: string;
}

/** Mensaje de recordatorio de cita listo para WhatsApp. */
export function buildAppointmentReminderMessage(d: AppointmentReminderMessageData): string {
  return (
    `¡Hola ${d.ownerName}! 🐾 Le recordamos la visita para ${d.patientName}: ` +
    `${d.appointmentTypeLabel} el ${d.appointmentDate} a las ${d.appointmentTime} hrs ` +
    `con ${d.veterinarianName}. ` +
    `Si necesita reprogramar, respóndanos por este chat. — ${clinic.name}`
  );
}

/** Etiquetas legibles de tipos de cita (compartidas por email y WhatsApp). */
export const appointmentTypeLabels: Record<string, string> = {
  consulta: 'Consulta General',
  vacunacion: 'Vacunación',
  cirugia: 'Cirugía',
  control: 'Control',
  emergencia: 'Emergencia',
  desparasitacion: 'Desparasitación',
  grooming: 'Grooming',
};
