import type { VisitResult } from './visit-types';

/**
 * Apertura con señal. Conserva la operación por paciente mientras no haya
 * respuesta: si la red se corta y la persona vuelve a tocar el botón, se
 * reintenta la MISMA operación (mismo id y misma hora, para que el hash del
 * servidor coincida) y se recibe la cita ya creada, en vez de abrir una
 * segunda atención.
 */
export function createOpener(userId: string) {
  const inFlight = new Map<number, { id: string; occurredAt: string }>();
  return async function open(patientId: number): Promise<number> {
    const operation = inFlight.get(patientId) ?? { id: crypto.randomUUID(), occurredAt: new Date().toISOString() };
    inFlight.set(patientId, operation);
    const response = await fetch('/api/visits/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Field-User': userId },
      body: JSON.stringify({ id: operation.id, patientId, occurredAt: operation.occurredAt }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Un rechazo (4xx) es definitivo: el siguiente intento es una operación
      // nueva. Un 5xx puede haberse aplicado, así que se reintenta la misma.
      if (response.status < 500) inFlight.delete(patientId);
      throw new Error(data.error || 'No se pudo abrir la atención. Revisa tu conexión.');
    }
    inFlight.delete(patientId);
    return (data as VisitResult).visitId;
  };
}
