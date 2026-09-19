export const CLINIC_TIME_ZONE = 'America/Santiago';

export function toClinicInput(value: string | Date): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: CLINIC_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function fromClinicInput(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Fecha y hora inválidas');
  const target = Date.parse(`${value}:00Z`);
  let candidate = target;
  for (let i = 0; i < 4; i++) {
    const shown = Date.parse(`${toClinicInput(new Date(candidate))}:00Z`);
    candidate += target - shown;
  }
  if (toClinicInput(new Date(candidate)) !== value) throw new Error('Esta hora no existe por el cambio de horario. Elige otra hora.');
  return new Date(candidate).toISOString();
}

export function clinicDay(value = new Date()): string { return toClinicInput(value).slice(0, 10); }

export function clinicDayRange(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(`${day}T12:00Z`))) throw new Error('Fecha inválida');
  // Find first real minute of the day: Santiago can skip midnight at DST.
  const midnight = (date: string) => {
    for (const hour of ['00', '01', '02']) {
      try { return new Date(fromClinicInput(`${date}T${hour}:00`)); } catch { /* DST gap */ }
    }
    throw new Error('Fecha inválida');
  };
  const next = new Date(`${day}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  return { start: midnight(day), end: midnight(next.toISOString().slice(0, 10)) };
}

export function clinicTime(value: string | Date) {
  return new Date(value).toLocaleTimeString('es-CL', { timeZone: CLINIC_TIME_ZONE, hour: '2-digit', minute: '2-digit' });
}

/**
 * Los componentes de calendario y agenda trabajaban con `Date#getHours()`,
 * es decir con el reloj del dispositivo: un teléfono configurado en otra
 * zona mostraba la visita a una hora distinta de la que muestra Hoy. Todo
 * lo que se dibuje en una grilla horaria debe pasar por estas funciones.
 */
export function clinicParts(value: string | Date) {
  const input = toClinicInput(value);
  if (!input) return null;
  return {
    day: input.slice(0, 10),
    year: Number(input.slice(0, 4)), month: Number(input.slice(5, 7)), date: Number(input.slice(8, 10)),
    hour: Number(input.slice(11, 13)), minute: Number(input.slice(14, 16)),
  };
}

/** Minutos transcurridos desde la medianoche local de la clínica. */
export function clinicMinutes(value: string | Date): number {
  const parts = clinicParts(value);
  return parts ? parts.hour * 60 + parts.minute : 0;
}

/** "HH:MM" en horario de la clínica, estable en cualquier dispositivo. */
export function clinicHhmm(value: string | Date): string {
  const input = toClinicInput(value);
  return input ? input.slice(11, 16) : '';
}

/** Día de la semana local (0 = domingo) sin usar el huso del dispositivo. */
export function clinicWeekday(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

/** Suma días sobre una fecha `YYYY-MM-DD` sin arrastrar husos ni DST. */
export function addClinicDays(day: string, amount: number): string {
  const base = new Date(`${day}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + amount);
  return base.toISOString().slice(0, 10);
}

/** Lunes de la semana que contiene `day`. */
export function clinicWeekStart(day: string): string {
  const weekday = clinicWeekday(day);
  return addClinicDays(day, weekday === 0 ? -6 : 1 - weekday);
}

/** Etiqueta legible de una fecha `YYYY-MM-DD` en la zona de la clínica. */
export function clinicDateLabel(day: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('es-CL', { ...options, timeZone: 'UTC' });
}

/** Instante ISO de una hora local de la clínica; útil para rangos de consulta. */
export function clinicInstant(day: string, hhmm: string): string {
  return fromClinicInput(`${day}T${hhmm}`);
}
