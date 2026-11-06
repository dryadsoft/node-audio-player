import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AuthService, safeReturnTo, SESSION_COOKIE } from './auth.service';

describe('Google login', () => {
  let auth: AuthService, root: string;
  const identity = { sub: 'google-sub', email: 'owner@example.test', email_verified: true };
  let response: any, req: any;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'nmp-oauth-'));
    process.env.AUTH_ORIGIN = 'https://music.example.test';
    process.env.AUTH_GOOGLE_CLIENT_ID = 'client';
    process.env.AUTH_GOOGLE_CLIENT_SECRET = 'secret';
    process.env.AUTH_DB_PATH = join(root, 'auth.sqlite');
    auth = new AuthService(); auth.onModuleInit(); auth.store.allow(identity.email);
    response = { cookie: jest.fn(), clearCookie: jest.fn(), redirect: jest.fn() };
    req = { query: { returnTo: '/lesson-notes?year=2026#page' }, headers: {} };
  });
  afterEach(() => {
    auth.onModuleDestroy(); rmSync(root, { recursive: true, force: true });
    for (const key of ['AUTH_ORIGIN', 'AUTH_GOOGLE_CLIENT_ID', 'AUTH_GOOGLE_CLIENT_SECRET', 'AUTH_DB_PATH']) delete process.env[key];
  });
  async function begin(payload: any = identity) {
    await auth.start(req, response);
    const url = new URL(response.redirect.mock.calls[0][0]);
    const binding = response.cookie.mock.calls[0][1];
    const nonce = url.searchParams.get('nonce');
    const client = (auth as any).client;
    jest.spyOn(client, 'getToken').mockResolvedValue({ tokens: { id_token: 'signed-token' } });
    jest.spyOn(client, 'verifyIdToken').mockResolvedValue({ getPayload: () => ({ nonce, ...payload }) });
    return { query: { code: 'code', state: url.searchParams.get('state') }, headers: { cookie: '__Host-nmp_oauth=' + binding } };
  }
  it('uses PKCE and verifies the ID token before issuing a secure persistent session', async () => {
    const callback = await begin();
    const url = new URL(response.redirect.mock.calls[0][0]);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    await auth.callback(callback as any, response);
    expect((auth as any).client.verifyIdToken).toHaveBeenCalledWith({ idToken: 'signed-token', audience: 'client' });
    const issued = response.cookie.mock.calls.find(([name]) => name === SESSION_COOKIE);
    expect(issued[2]).toEqual(expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 400 * 86400000 }));
    expect(auth.store.authenticate(issued[1])).toEqual({ sub: identity.sub, email: identity.email });
    expect(response.redirect).toHaveBeenLastCalledWith('/lesson-notes?year=2026#page');
    await auth.callback(callback as any, response);
    expect(response.redirect).toHaveBeenLastCalledWith('/?authError=login');
  });
  it.each([{ nonce: 'wrong' }, { email_verified: false }, { email: 'outsider@example.test' }])('refuses invalid identity claims %j', async patch => {
    const callback = await begin({ ...identity, ...patch });
    await auth.callback(callback as any, response);
    expect(response.cookie.mock.calls.some(([name]) => name === SESSION_COOKIE)).toBe(false);
  });
  it('binds callbacks to the initiating browser', async () => {
    const callback = await begin(); callback.headers.cookie = '__Host-nmp_oauth=another-browser';
    await auth.callback(callback as any, response);
    expect((auth as any).client.getToken).not.toHaveBeenCalled();
  });
  it('refuses a failed signature verification', async () => {
    const callback = await begin();
    (auth as any).client.verifyIdToken.mockRejectedValue(new Error('invalid signature'));
    await auth.callback(callback as any, response);
    expect(response.cookie.mock.calls.some(([name]) => name === SESSION_COOKIE)).toBe(false);
  });
});

it.each(['https://evil.example', '//evil.example', '/\\evil.example', '/api/auth/logout'])('rejects unsafe return address %s', value => {
  expect(safeReturnTo(value)).toBe('/');
});
it('preserves encoded Korean filters on allowed app screens', () => {
  expect(new URL(safeReturnTo('/?dir=%ED%95%9C%EA%B8%80%20%ED%8F%B4%EB%8D%94'), 'https://app.invalid').searchParams.get('dir')).toBe('한글 폴더');
});
