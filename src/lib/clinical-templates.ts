import type { TemplateSection } from '../db/schema/clinical';

// Este módulo se importa como valor desde el navegador (ClinicalNote), así
// que su única dependencia debe seguir siendo un `import type`. Un import
// de valor hacia `db/` o Drizzle arrastraría el cliente de PostgreSQL al
// paquete del teléfono y rompería la compilación.

export interface TemplateShape {
  id: number | null;
  name: string;
  visitType: string;
  version: number;
  sections: TemplateSection[];
  phrases: string[];
  /** Plantilla incorporada en la aplicación, no creada en la clínica. */
  builtIn: boolean;
  ownerUserId?: string | null;
}

/**
 * Plantillas mínimas para arrancar. Son andamiaje y nada más: ningún campo
 * llega con texto, y las frases son insumos para escribir, no hallazgos ya
 * comprobados. Rellenar «sin alteraciones» automáticamente convertiría en
 * afirmación clínica algo que nadie examinó — «no registrado» y «normal»
 * no son lo mismo y la diferencia puede importar mucho después.
 *
 * Una clínica puede reemplazarlas creando las suyas en la base; estas solo
 * se ofrecen cuando no hay ninguna definida para ese tipo de visita.
 */
export const BUILT_IN_TEMPLATES: TemplateShape[] = [
  {
    id: null, builtIn: true, version: 1, visitType: 'control', name: 'Control',
    sections: [
      { field: 'reason', label: 'Motivo del control', hint: '¿Qué se está controlando y desde cuándo?' },
      { field: 'subjective', label: 'Lo que reporta el responsable', hint: 'Evolución en casa, apetito, ánimo, cumplimiento del tratamiento' },
      { field: 'diagnosis', label: 'Evolución observada', hint: 'Comparar con la atención anterior' },
      { field: 'treatment', label: 'Indicaciones actualizadas', hint: 'Continuar, ajustar o suspender; próximo control' },
      { field: 'observations', label: 'Observaciones internas', collapsed: true },
    ],
    phrases: [
      'Se mantiene el tratamiento indicado en la consulta anterior.',
      'Se ajusta la dosis según el peso registrado hoy.',
      'Se solicita nuevo control en ',
      'El responsable refiere buena tolerancia al medicamento.',
    ],
  },
  {
    id: null, builtIn: true, version: 1, visitType: 'vacunacion', name: 'Vacunación',
    sections: [
      { field: 'reason', label: 'Vacuna a aplicar' },
      { field: 'subjective', label: 'Estado previo referido', hint: 'Ayuno, decaimiento, reacciones anteriores' },
      { field: 'diagnosis', label: 'Evaluación previa a la aplicación', hint: 'Condición que permite o posterga la vacunación' },
      { field: 'treatment', label: 'Indicaciones posteriores', hint: 'Qué vigilar y cuándo consultar' },
      { field: 'observations', label: 'Observaciones internas', collapsed: true },
    ],
    phrases: [
      'Se aplica la dosis en la región escapular izquierda.',
      'Se indica observar el sitio de aplicación durante 48 horas.',
      'Se posterga la vacunación por el estado del paciente.',
      'Próxima dosis según calendario: ',
    ],
  },
  {
    id: null, builtIn: true, version: 1, visitType: 'consulta', name: 'Consulta general',
    sections: [
      { field: 'reason', label: 'Motivo de consulta' },
      { field: 'subjective', label: 'Lo que reporta el responsable', hint: 'Desde cuándo, qué cambió, qué hicieron en casa' },
      { field: 'diagnosis', label: 'Evaluación y diagnóstico', hint: 'Hallazgos del examen y su interpretación' },
      { field: 'treatment', label: 'Tratamiento e indicaciones' },
      { field: 'observations', label: 'Observaciones internas', collapsed: true, hint: 'No se incluyen en el resumen para el responsable' },
    ],
    phrases: [
      'Se indica reposo relativo por ',
      'Se deriva a examen complementario: ',
      'Se explican signos de alarma para consultar de urgencia.',
      'El responsable declara comprender las indicaciones entregadas.',
    ],
  },
];

/** Plantilla incorporada para un tipo de visita, si existe. */
export function builtInTemplate(visitType: string): TemplateShape | undefined {
  return BUILT_IN_TEMPLATES.find((t) => t.visitType === visitType);
}

/**
 * Campos que una plantilla puede estructurar. Cualquier otro valor que
 * llegue desde la base se descarta: la plantilla no debe poder inventar
 * campos que el registro clínico no tiene.
 */
export const TEMPLATE_FIELDS = ['reason', 'subjective', 'diagnosis', 'treatment', 'observations'] as const;

export function sanitizeSections(sections: unknown): TemplateSection[] {
  if (!Array.isArray(sections)) return [];
  return sections
    .filter((s): s is TemplateSection => Boolean(s) && typeof s === 'object' && (TEMPLATE_FIELDS as readonly string[]).includes((s as TemplateSection).field))
    .map((s) => ({ field: s.field, label: String(s.label ?? s.field).slice(0, 80), hint: s.hint ? String(s.hint).slice(0, 200) : undefined, collapsed: Boolean(s.collapsed) }));
}
