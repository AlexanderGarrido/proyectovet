import { describe, expect, it } from 'vitest';
import { allowedKinds, paginateTimeline, TIMELINE_KINDS, type TimelineItem } from './timeline';

const item = (key: string, at: string): TimelineItem => {
  const [kind, id] = key.split(':');
  return { key, kind: kind as TimelineItem['kind'], id: Number(id), at, title: key };
};

describe('Permisos de la cronología', () => {
  it('el veterinario y administración ven todas las fuentes', () => {
    expect(allowedKinds('veterinario')).toEqual([...TIMELINE_KINDS]);
    expect(allowedKinds('admin')).toEqual([...TIMELINE_KINDS]);
  });
  it('recepción coordina y cobra, pero no lee la nota clínica ni sus documentos', () => {
    const kinds = allowedKinds('recepcionista');
    expect(kinds).toEqual(['cita', 'vacuna', 'cobro', 'comunicacion']);
    for (const restricted of ['consulta', 'receta', 'laboratorio', 'documento']) {
      expect(kinds).not.toContain(restricted);
    }
  });
  it('un rol desconocido no ve nada', () => {
    expect(allowedKinds('tutor')).toEqual([]);
  });
});

describe('Paginación estable de la cronología', () => {
  const items = [
    item('consulta:1', '2026-09-10T10:00:00.000Z'),
    item('cita:5', '2026-09-12T10:00:00.000Z'),
    item('vacuna:3', '2026-09-12T10:00:00.000Z'),
    item('cobro:9', '2026-09-14T10:00:00.000Z'),
  ];

  it('ordena de lo más reciente a lo más antiguo', () => {
    expect(paginateTimeline(items, 10).items.map((i) => i.key)).toEqual(['cobro:9', 'vacuna:3', 'cita:5', 'consulta:1']);
  });

  it('recorre todas las páginas sin repetir ni perder elementos con fechas iguales', () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const result = paginateTimeline(items, 2, cursor);
      seen.push(...result.items.map((i) => i.key));
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(['cobro:9', 'vacuna:3', 'cita:5', 'consulta:1']);
    expect(new Set(seen).size).toBe(items.length);
    expect(cursor).toBeUndefined();
  });

  it('no entrega cursor cuando la página agota los elementos', () => {
    expect(paginateTimeline(items, 4).nextCursor).toBeUndefined();
    expect(paginateTimeline(items, 3).nextCursor).toBeDefined();
  });

  it('un elemento insertado después del corte no desplaza la página siguiente', () => {
    const first = paginateTimeline(items, 2);
    // Llega algo nuevo y más reciente entre una página y la otra: con
    // OFFSET habría corrido todo y se habría repetido un elemento.
    const conMasReciente = [...items, item('cita:20', '2026-09-15T10:00:00.000Z')];
    const second = paginateTimeline(conMasReciente, 2, first.nextCursor);
    expect(second.items.map((i) => i.key)).toEqual(['cita:5', 'consulta:1']);
  });

  it('un cursor ilegible devuelve la primera página en vez de fallar', () => {
    expect(paginateTimeline(items, 2, 'basura').items.map((i) => i.key)).toEqual(['cobro:9', 'vacuna:3']);
  });
});

describe('Empate exacto entre fuentes distintas', () => {
  // Una vacuna se ancla al mediodía UTC porque solo tiene día. Una cita a
  // las 09:00 de Chile en horario de verano se guarda como 12:00Z: mismo
  // instante. Si el corte de página cae entre ambas, la segunda no puede
  // quedar fuera de la cronología.
  const mismoInstante = '2026-01-15T12:00:00.000Z';
  const items = [
    item('vacuna:7', mismoInstante),
    item('cita:4', mismoInstante),
    item('consulta:2', '2026-01-10T10:00:00.000Z'),
  ];

  it('la página siguiente incluye el elemento que empata con el cursor', () => {
    const first = paginateTimeline(items, 1);
    expect(first.items.map((i) => i.key)).toEqual(['vacuna:7']);
    expect(first.nextCursor).toBe(`${mismoInstante}|vacuna:7`);
    const second = paginateTimeline(items, 1, first.nextCursor);
    expect(second.items.map((i) => i.key)).toEqual(['cita:4']);
    const third = paginateTimeline(items, 1, second.nextCursor);
    expect(third.items.map((i) => i.key)).toEqual(['consulta:2']);
    expect(third.nextCursor).toBeUndefined();
  });

  it('ningún elemento aparece dos veces al recorrer de a uno', () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 6; i++) {
      const page = paginateTimeline(items, 1, cursor);
      seen.push(...page.items.map((x) => x.key));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(['vacuna:7', 'cita:4', 'consulta:2']);
  });
});
