import 'fake-indexeddb/auto';
import { adoptOwner, clearDeviceRecords, cleanupKey, deniedKey, ownerKey, readSession, revokeSession, savedOwner } from './session';
const owner = { sub: 'account-one', email: 'one@example.test' };
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
it('binds legacy records once and refuses switching their owner', () => {
  adoptOwner(owner);
  expect(savedOwner()).toEqual(owner);
  expect(() => adoptOwner({ sub: 'account-two', email: 'two@example.test' })).toThrow('다른 계정');
  expect(savedOwner()).toEqual(owner);
});
it('clears only app records after logout while preserving unrelated preferences', async () => {
  for (const name of ['node-audio-player-drafts', 'node-audio-player-attendance']) {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('records');
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
  }
  adoptOwner(owner); localStorage.setItem(cleanupKey, '1'); localStorage.setItem(deniedKey, '1');
  localStorage.setItem('theme', 'dark'); sessionStorage.setItem('nmp.auth.return', 'private');
  await clearDeviceRecords();
  expect(await indexedDB.databases()).toHaveLength(0);
  expect(localStorage.getItem(ownerKey)).toBeNull();
  expect(localStorage.getItem(cleanupKey)).toBeNull();
  expect(sessionStorage.getItem('nmp.auth.return')).toBeNull();
  expect(localStorage.getItem('theme')).toBe('dark');
});
it('does not erase device state when logout fails', async () => {
  adoptOwner(owner); localStorage.setItem(cleanupKey, '1');
  global.fetch = jest.fn().mockResolvedValue({ status: 503 });
  await expect(revokeSession()).rejects.toThrow('로그아웃');
  expect(savedOwner()).toEqual(owner);
  expect(localStorage.getItem(cleanupKey)).toBe('1');
});
it('does not treat an HTML login response as authenticated', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('HTML'); } });
  await expect(readSession()).rejects.toThrow();
});
it('waits for the browser to release a shared lock before requesting exclusive access', async () => {
  const { acquireWorkspaceLock } = await import('./session');
  let held = false;
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request: jest.fn(async (_name, options, callback) => {
      if (options.ifAvailable && held) return callback(null);
      held = true;
      await callback({});
      await Promise.resolve();
      held = false;
    }),
  } });
  const shared = await acquireWorkspaceLock();
  await shared();
  const exclusive = await acquireWorkspaceLock(true);
  expect(held).toBe(true);
  await exclusive();
  expect(held).toBe(false);
});
