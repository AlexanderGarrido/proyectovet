import type { VisitResult } from './visit-types';

export interface OpenOptions {
  /** 'pasada': consulta registrada después, con la fecha elegida. */
  origin?: 'pasada';
  occurredAt?: string;
}

/**
 * Apertura con señal. Conserva la operación mientras no haya respuesta: si
 * la red se corta y la persona vuelve a tocar el botón, se reintenta la
 * MISMA operación (mismo id y misma hora, para que el hash del servidor
 * coincida) y se recibe la cita ya creada, en vez de abrir una segunda
 * atención. Otro paciente u otra fecha elegida es otra operación.
 */
export function createOpener(userId: string) {
  const inFlight = new Map<string, { id: string; occurredAt: string }>();
  return async function open(patientId: number, options: OpenOptions = {}): Promise<number> {
    const key = `${patientId}|${options.origin ?? 'sin_cita'}|${options.occurredAt ?? ''}`;
    const operation = inFlight.get(key) ?? { id: crypto.randomUUID(), occurredAt: options.occurredAt ?? new Date().toISOString() };
    inFlight.set(key, operation);
    const response = await fetch('/api/visits/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Field-User': userId },
      body: JSON.stringify({ id: operation.id, patientId, occurredAt: operation.occurredAt, ...(options.origin ? { origin: options.origin } : {}) }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Un rechazo (4xx) es definitivo: el siguiente intento es una operación
      // nueva. Un 5xx puede haberse aplicado, así que se reintenta la misma.
      if (response.status < 500) inFlight.delete(key);
      throw new Error(data.error || 'No se pudo abrir la atención. Revisa tu conexión.');
    }
    inFlight.delete(key);
    return (data as VisitResult).visitId;
  };
}
