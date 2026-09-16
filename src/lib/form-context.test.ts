import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFormChoices, preserveFormChoice, positiveId, readFormContext, safeVisitReturn, verifyInvoiceContext } from './form-context';

afterEach(() => vi.unstubAllGlobals());

describe('contexto de visita', () => {
  it('conserva paciente, responsable y cita al abrir un cobro', () => {
    expect(readFormContext(new URLSearchParams('patientId=21&ownerId=7&appointmentId=42&returnTo=%2Fcitas%2F42')))
      .toEqual({ patientId: 21, ownerId: 7, appointmentId: 42, returnTo: '/citas/42' });
  });
  it.each(['https://evil.example', '//evil.example', '/citas/1/../../login', '/citas/1?next=evil', '/citas/0', '/citas/1#x', '/citas/1%0a'])('rechaza retorno ajeno a una visita: %s', (value) => {
    expect(safeVisitReturn(value)).toBeUndefined();
  });
  it.each(['0', '-1', '1.5', 'NaN', '9007199254740992', '', '1e3', null])('rechaza identificador inválido %s', (value) => {
    expect(positiveId(value)).toBeUndefined();
  });
  it('rechaza responsable o paciente ajeno a la cita, aun con IDs válidos', () => {
    const appointment = { ownerId: 7, patientId: 21 };
    expect(() => verifyInvoiceContext(appointment, { ownerId: 8, patientId: 21 })).toThrow('responsable');
    expect(() => verifyInvoiceContext(appointment, { ownerId: 7, patientId: 22 })).toThrow('paciente');
    expect(() => verifyInvoiceContext(appointment, { ownerId: 7, patientId: 21 })).not.toThrow();
    expect(() => verifyInvoiceContext(appointment, {})).not.toThrow();
  });
  it('carga un paciente preseleccionado aunque no esté en la primera página', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1 }]))).mockResolvedValueOnce(new Response(JSON.stringify({ id: 201 })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchFormChoices('/api/patients', 201)).toEqual([{ id: 1 }, { id: 201 }]);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/patients/201');
  });
  it('no ofrece guardar datos de una respuesta fallida como si fueran opciones', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })));
    await expect(fetchFormChoices('/api/patients', 201)).rejects.toThrow('cargar');
  });
});

describe('profesional actual fuera del catálogo activo', () => {
  it('preserva la asignación inactiva sin sustituirla por un profesional activo', () => {
    const active = [{ id: 'active-vet', name: 'Ana' }];
    const selected = { id: 'inactive-vet', name: 'Luis (asignación actual; no activo)' };
    expect(preserveFormChoice(active, selected)).toEqual([...active, selected]);
    expect(active).toHaveLength(1);
  });
  it('no duplica ni cambia el nombre de un profesional que sigue activo', () => {
    const active = [{ id: 'vet', name: 'Ana' }];
    expect(preserveFormChoice(active, { id: 'vet', name: 'Asignación actual' })).toEqual(active);
    expect(preserveFormChoice(active)).toEqual(active);
  });
});
