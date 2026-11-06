export interface Identity { sub: string; email: string }
export const ownerKey = 'nmp.auth.owner';
export const deniedKey = 'nmp.auth.denied';
export const cleanupKey = 'nmp.auth.cleanup';
const lockName = 'nmp-auth-workspace';
export async function readSession(): Promise<Identity | null> {
  const abort = new AbortController();
  const timer = window.setTimeout(() => abort.abort(), 10000);
  try {
    const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: abort.signal });
    if (!response.ok) throw new Error('로그인 상태를 확인하지 못했습니다.');
    const data = await response.json();
    if (data.authenticated === false) return null;
    if (data.authenticated !== true || typeof data.user?.sub !== 'string' || typeof data.user?.email !== 'string')
      throw new Error('로그인 응답을 확인하지 못했습니다.');
    return data.user;
  } finally { window.clearTimeout(timer); }
}
export function savedOwner(): Identity | null {
  const data = JSON.parse(localStorage.getItem(ownerKey) || 'null');
  return data && typeof data.sub === 'string' && typeof data.email === 'string' ? data : null;
}
export function adoptOwner(user: Identity) {
  const owner = savedOwner();
  if (owner && owner.sub !== user.sub)
    throw new Error('이 기기에 다른 계정의 기록이 남아 있습니다. 기존 계정으로 로그인해 동기화·로그아웃을 완료해 주세요.');
  localStorage.setItem(ownerKey, JSON.stringify(user));
  localStorage.removeItem(deniedKey);
}
// The shared lock prevents a new tab from opening workspaces during deletion.
export function acquireWorkspaceLock(exclusive = false): Promise<() => Promise<void>> {
  const locks = (navigator as any).locks;
  if (!locks) return Promise.reject(new Error('이 브라우저는 안전한 로그아웃을 지원하지 않습니다. 브라우저를 업데이트해 주세요.'));
  return new Promise((resolve, reject) => {
    const done = locks.request(lockName, { mode: exclusive ? 'exclusive' : 'shared', ifAvailable: exclusive }, async (lock: unknown) => {
      if (!lock) { reject(new Error('다른 앱 탭을 닫은 뒤 다시 로그아웃해 주세요.')); return; }
      await new Promise<void>(release => resolve(async () => { release(); await done; }));
    }).catch(reject);
  });
}
export async function requireSingleClient() {
  const controller = navigator.serviceWorker?.controller;
  if (!controller) throw new Error('앱을 새로고침한 뒤 다시 로그아웃해 주세요.');
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const finish = (error?: Error) => {
      clearTimeout(timer); channel.port1.close();
      error ? reject(error) : resolve();
    };
    const timer = setTimeout(() => finish(new Error('앱 업데이트 후 다시 로그아웃해 주세요.')), 3000);
    channel.port1.onmessage = event => finish(event.data?.count === 1 ? undefined : new Error('다른 앱 탭을 닫은 뒤 다시 로그아웃해 주세요.'));
    controller.postMessage({ type: 'AUTH_CLIENT_COUNT' }, [channel.port2]);
  });
}
export async function revokeSession() {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10000);
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: abort.signal, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (response.status !== 204) throw new Error('로그아웃을 완료하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.');
  } finally { clearTimeout(timer); }
}
export async function clearDeviceRecords() {
  for (const name of ['node-audio-player-drafts', 'node-audio-player-attendance']) {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('기기 기록 삭제에 실패했습니다. 다시 시도해 주세요.'));
      request.onblocked = () => reject(new Error('다른 앱 탭을 닫고 기기 기록 삭제를 다시 시도해 주세요.'));
    });
  }
  for (const key of [ownerKey, deniedKey, 'lesson-notes.changed', 'attendance.changed']) localStorage.removeItem(key);
  for (const key of ['nmp.auth.return', 'nmp.auth.attempt']) sessionStorage.removeItem(key);
  localStorage.removeItem(cleanupKey);
}
