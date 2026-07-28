/**
 * Comprime una imagen en el navegador antes de subirla: redimensiona al lado
 * más largo indicado y re-codifica como JPEG, bajando la calidad hasta que
 * el resultado quepa bajo `maxBytes`. Pensado para fotos clínicas tomadas
 * con la cámara del teléfono en terreno (varios MB) que de otro modo
 * inflarían la base de datos — el mismo límite (500KB) que ya se exige en
 * el schema Zod (`photos`, `patientSchema.photo`).
 *
 * Solo corre en el navegador (usa HTMLCanvasElement); no importar desde
 * código de servidor.
 */
export async function compressImage(
  file: File,
  { maxDimension = 1280, maxBytes = 500_000, startQuality = 0.8 }: { maxDimension?: number; maxBytes?: number; startQuality?: number } = {}
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen en este navegador');
  ctx.drawImage(bitmap, 0, 0, width, height);

  let quality = startQuality;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  // Base64 pesa ~4/3 del binario; baja calidad en pasos hasta entrar en el límite.
  while (dataUrl.length * 0.75 > maxBytes && quality > 0.3) {
    quality -= 0.15;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }

  if (dataUrl.length * 0.75 > maxBytes) {
    throw new Error('La imagen sigue siendo muy pesada incluso comprimida al mínimo');
  }

  return dataUrl;
}
