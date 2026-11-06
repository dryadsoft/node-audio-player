import { mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SessionStore } from './session-store';

describe('persistent sessions', () => {
  let directory: string;
  let path: string;
  let store: SessionStore;
  const user = { sub: 'google-sub-1', email: 'allowed@example.test' };
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'nmp-auth-'));
    path = join(directory, 'auth.sqlite');
    store = new SessionStore(path);
    store.allow(user.email);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  it('survives restart and does not expire after long inactivity', () => {
    const token = store.issue(user);
    store.close();
    store = new SessionStore(path);
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 800 * 86400000);
    expect(store.authenticate(token)).toEqual(user);
  });
  it('stores no raw bearer token and restricts database permissions', () => {
    const token = store.issue(user);
    expect(readFileSync(path).includes(Buffer.from(token))).toBe(false);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
  it('revokes only the selected session, idempotently', () => {
    const first = store.issue(user), second = store.issue(user);
    store.revoke(first);
    store.revoke(first);
    expect(store.authenticate(first)).toBeUndefined();
    expect(store.authenticate(second)).toEqual(user);
  });
  it('permanently revokes existing sessions when an email is removed', () => {
    const token = store.issue(user);
    store.remove(user.email.toUpperCase());
    expect(store.authenticate(token)).toBeUndefined();
    expect(() => store.issue(user)).toThrow('Identity is not allowed');
    store.allow(user.email);
    expect(store.authenticate(token)).toBeUndefined();
    expect(store.authenticate(store.issue(user))).toEqual(user);
  });
  it('rejects unknown, malformed and non-allowlisted credentials', () => {
    expect(store.authenticate('bad')).toBeUndefined();
    expect(store.authenticate('a'.repeat(43))).toBeUndefined();
    expect(() => store.issue({ ...user, email: 'other@example.test' })).toThrow();
    expect(() => store.issue({ ...user, sub: '' })).toThrow();
  });
  it('supports administrator revocation without removing email permission', () => {
    const tokens = [store.issue(user), store.issue(user)];
    store.revokeAll(user.email);
    tokens.forEach(token => expect(store.authenticate(token)).toBeUndefined());
    expect(store.isAllowed(user.email)).toBe(true);
  });
});
