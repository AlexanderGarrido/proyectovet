/**
 * Deep links de navegación a partir de una dirección de texto libre. Cada
 * app arma su propia búsqueda por texto (sin geocoding ni API keys) — el
 * usuario elige la app que ya tiene instalada.
 */
export function googleMapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function wazeUrl(address: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}

export function appleMapsUrl(address: string): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(address)}`;
}
