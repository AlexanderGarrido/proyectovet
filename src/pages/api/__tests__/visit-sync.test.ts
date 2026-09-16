import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../db', () => ({ db: {} }));
vi.mock('../../../lib/save-visit', () => ({ saveVisit: vi.fn() }));
import { saveVisit } from '../../../lib/save-visit';
import { POST } from '../visits/[id]/sync';

beforeEach(() => vi.clearAllMocks());

describe('visit synchronization session ownership', () => {
  it.each([null, 'different-user'])('rejects missing or mismatched X-Field-User before saving (%s)', async (identity) => {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (identity) headers.set('X-Field-User', identity);
    const response = await POST({
      locals: { user: { id: 'vet-1', name: 'Vet', role: 'veterinario' } },
      request: new Request('http://localhost/api/visits/7/sync', { method: 'POST', headers, body: '{}' }),
      params: { id: '7' },
    } as any);
    expect(response.status).toBe(401);
    expect(saveVisit).not.toHaveBeenCalled();
  });

  it('rejects an expired session before saving', async () => {
    const response = await POST({ locals: {}, request: new Request('http://localhost/api/visits/7/sync'), params: { id: '7' } } as any);
    expect(response.status).toBe(401);
    expect(saveVisit).not.toHaveBeenCalled();
  });
});
