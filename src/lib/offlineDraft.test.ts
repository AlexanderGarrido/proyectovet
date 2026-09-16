import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveDraft } from './offlineDraft';

afterEach(() => vi.unstubAllGlobals());
describe('draft persistence feedback', () => {
  it('reports failure when browser storage is unavailable', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('Unavailable'); } });
    expect(await saveDraft('user:patient', { reason: 'Exam' })).toBe(false);
  });
  it('reports success only after the write transaction completes and closes storage', async () => {
    const tx: any = { objectStore: () => ({ put: vi.fn() }) };
    const close = vi.fn();
    vi.stubGlobal('indexedDB', { open: () => {
      const req: any = { result: { transaction: () => tx, close } };
      queueMicrotask(() => req.onsuccess());
      return req;
    } });
    const pending = saveDraft('user:patient', { reason: 'Exam' });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(close).not.toHaveBeenCalled();
    tx.oncomplete();
    expect(await pending).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });
});
