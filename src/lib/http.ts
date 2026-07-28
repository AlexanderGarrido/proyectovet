// Helpers para respuestas JSON uniformes en los endpoints.

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/** Respuesta de error JSON con forma consistente: { error: string }. */
export function jsonError(status: number, message: string, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

/** Respuesta de éxito JSON. */
export function jsonOk(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

/**
 * Respuesta de éxito JSON para listados paginados: mantiene el body como el
 * array plano de siempre (no rompe a ningún consumidor existente) y expone
 * el total de registros vía el header `X-Total-Count`, para que una UI de
 * paginación pueda calcular cuántas páginas hay sin cambiar el contrato.
 */
export function jsonOkPaginated(data: unknown[], total: number, status = 200): Response {
  return jsonOk(data, status, { 'X-Total-Count': String(total) });
}
