import { afterEach, describe, expect, it, vi } from 'vitest';
import { isEnabled } from './features';
import { BUILT_IN_TEMPLATES, builtInTemplate, sanitizeSections } from './clinical-templates';

afterEach(() => vi.unstubAllEnvs());

describe('Banderas de función', () => {
  it('todo viene activado por omisión', () => {
    for (const feature of ['cronologia', 'plantillas', 'catalogoServicios', 'recorrido', 'pendientes', 'botiquinPreparacion'] as const) {
      expect(isEnabled(feature)).toBe(true);
    }
  });

  it('solo "off" apaga una función: un valor mal escrito no la desactiva por accidente', () => {
    vi.stubEnv('PUBLIC_FEATURE_RECORRIDO', 'off');
    expect(isEnabled('recorrido')).toBe(false);
    vi.stubEnv('PUBLIC_FEATURE_RECORRIDO', 'OFF');
    expect(isEnabled('recorrido')).toBe(false);
    vi.stubEnv('PUBLIC_FEATURE_RECORRIDO', 'false');
    expect(isEnabled('recorrido')).toBe(true);
    vi.stubEnv('PUBLIC_FEATURE_RECORRIDO', '0');
    expect(isEnabled('recorrido')).toBe(true);
  });

  it('apagar una función no afecta a las demás', () => {
    vi.stubEnv('PUBLIC_FEATURE_CATALOGO', 'off');
    expect(isEnabled('catalogoServicios')).toBe(false);
    expect(isEnabled('cronologia')).toBe(true);
  });
});

describe('Plantillas clínicas incorporadas', () => {
  it('cubre control, vacunación y consulta general', () => {
    expect(BUILT_IN_TEMPLATES.map((t) => t.visitType).sort()).toEqual(['consulta', 'control', 'vacunacion']);
    expect(builtInTemplate('control')?.name).toBe('Control');
    expect(builtInTemplate('cirugia')).toBeUndefined();
  });

  it('ninguna plantilla trae hallazgos ni diagnósticos escritos', () => {
    // «No registrado» y «normal» no son lo mismo: una plantilla que
    // rellenara «sin alteraciones» afirmaría algo que nadie examinó.
    for (const template of BUILT_IN_TEMPLATES) {
      for (const section of template.sections) {
        expect(section).not.toHaveProperty('value');
        expect(section.hint ?? '').not.toMatch(/sin alteraciones|normal\b/i);
      }
      for (const phrase of template.phrases) {
        expect(phrase).not.toMatch(/sin alteraciones|todo normal/i);
      }
    }
  });

  it('las observaciones internas quedan plegadas y advertidas', () => {
    const consulta = builtInTemplate('consulta')!;
    const observaciones = consulta.sections.find((s) => s.field === 'observations')!;
    expect(observaciones.collapsed).toBe(true);
    expect(observaciones.hint).toMatch(/resumen/i);
  });

  it('descarta campos que el registro clínico no tiene', () => {
    const sections = sanitizeSections([
      { field: 'diagnosis', label: 'Evaluación' },
      { field: 'precio', label: 'Precio inventado' },
      null,
    ]);
    expect(sections).toEqual([{ field: 'diagnosis', label: 'Evaluación', hint: undefined, collapsed: false }]);
  });

  it('recorta etiquetas largas en vez de romper la interfaz', () => {
    const [section] = sanitizeSections([{ field: 'reason', label: 'x'.repeat(200) }]);
    expect(section.label).toHaveLength(80);
  });
});
