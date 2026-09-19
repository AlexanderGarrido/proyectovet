/**
 * Banderas de función para el despliegue gradual.
 *
 * Desactivar una interfaz nunca debe implicar borrar su tabla: los datos
 * ya registrados seguirían siendo válidos y recrear la tabla no los
 * devuelve. Estas banderas apagan la entrada visible; lo guardado queda
 * donde está y vuelve a aparecer al encenderlas.
 *
 * Todas vienen activadas por omisión. Se apagan con la cadena "off" en la
 * variable de entorno correspondiente, para que un valor mal escrito no
 * apague una función por accidente.
 */
type FeatureName =
  | 'cronologia'
  | 'plantillas'
  | 'catalogoServicios'
  | 'recorrido'
  | 'pendientes'
  | 'botiquinPreparacion';

const ENV_KEYS: Record<FeatureName, string> = {
  cronologia: 'PUBLIC_FEATURE_CRONOLOGIA',
  plantillas: 'PUBLIC_FEATURE_PLANTILLAS',
  catalogoServicios: 'PUBLIC_FEATURE_CATALOGO',
  recorrido: 'PUBLIC_FEATURE_RECORRIDO',
  pendientes: 'PUBLIC_FEATURE_PENDIENTES',
  botiquinPreparacion: 'PUBLIC_FEATURE_BOTIQUIN',
};

function read(key: string): string | undefined {
  // `import.meta.env` existe en el cliente y en el servidor de Astro;
  // `process.env` cubre los scripts y las pruebas en Node.
  const fromVite = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[key];
  if (fromVite !== undefined) return fromVite;
  return typeof process !== 'undefined' ? process.env?.[key] : undefined;
}

export function isEnabled(feature: FeatureName): boolean {
  return read(ENV_KEYS[feature])?.trim().toLowerCase() !== 'off';
}

export const features = {
  get cronologia() { return isEnabled('cronologia'); },
  get plantillas() { return isEnabled('plantillas'); },
  get catalogoServicios() { return isEnabled('catalogoServicios'); },
  get recorrido() { return isEnabled('recorrido'); },
  get pendientes() { return isEnabled('pendientes'); },
  get botiquinPreparacion() { return isEnabled('botiquinPreparacion'); },
};
