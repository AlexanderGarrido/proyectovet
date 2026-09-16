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
