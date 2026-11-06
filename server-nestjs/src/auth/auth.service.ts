import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { resolve } from 'path';
import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import { Request, Response } from 'express';
import { SessionStore } from './session-store';

export const SESSION_COOKIE = '__Host-nmp_session';
const OAUTH_COOKIE = '__Host-nmp_oauth';
const options = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' };
export function cookie(req: Request, name: string): string {
  const matches = (req.headers.cookie || '').split(';')
    .map(value => value.trim()).filter(value => value.startsWith(name + '='));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : '';
}
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) return '/';
  try {
    const parsed = new URL(value, 'https://app.invalid');
    if (parsed.origin !== 'https://app.invalid' || !['/', '/lesson-plans', '/lesson-notes', '/attendance'].includes(parsed.pathname)) return '/';
    parsed.searchParams.delete('reauth');
    return parsed.pathname + parsed.search + parsed.hash;
  } catch { return '/'; }
}

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  store: SessionStore;
  origin: string;
  private client: OAuth2Client;
  onModuleInit() {
    const { AUTH_ORIGIN, AUTH_GOOGLE_CLIENT_ID, AUTH_GOOGLE_CLIENT_SECRET, AUTH_DB_PATH } = process.env;
    if (!AUTH_ORIGIN || !AUTH_GOOGLE_CLIENT_ID || !AUTH_GOOGLE_CLIENT_SECRET)
      throw new Error('AUTH_ORIGIN, AUTH_GOOGLE_CLIENT_ID and AUTH_GOOGLE_CLIENT_SECRET are required');
    const url = new URL(AUTH_ORIGIN);
    if (url.protocol !== 'https:' || url.origin !== AUTH_ORIGIN)
      throw new Error('AUTH_ORIGIN must be an HTTPS origin without a trailing slash');
    this.origin = url.origin;
    this.client = new OAuth2Client(AUTH_GOOGLE_CLIENT_ID, AUTH_GOOGLE_CLIENT_SECRET,
      this.origin + '/api/auth/google/callback');
    this.store = new SessionStore(AUTH_DB_PATH || resolve(process.cwd(), 'data/auth.sqlite'));
  }
  onModuleDestroy() { this.store?.close(); }
  csrf(req: Request) {
    return req.headers.origin === this.origin && req.get('X-Requested-With') === 'XMLHttpRequest';
  }
  session(req: Request, res: Response) {
    const token = cookie(req, SESSION_COOKIE);
    const identity = this.store.authenticate(token);
    if (identity && this.store.renew(token)) this.setSession(res, token);
    return identity;
  }
  private setSession(res: Response, token: string) {
    res.cookie(SESSION_COOKIE, token, { ...options, maxAge: 400 * 86400000 });
  }
  async start(req: Request, res: Response) {
    const binding = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const { codeVerifier, codeChallenge } = await this.client.generateCodeVerifierAsync();
    const state = this.store.beginOAuth(binding, nonce, codeVerifier, safeReturnTo(req.query.returnTo));
    res.cookie(OAUTH_COOKIE, binding, { ...options, maxAge: 600000 });
    res.redirect(this.client.generateAuthUrl({ scope: ['openid', 'email'], state, nonce,
      code_challenge: codeChallenge, code_challenge_method: CodeChallengeMethod.S256,
      prompt: 'select_account', access_type: 'online' }));
  }
  async callback(req: Request, res: Response) {
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const transaction = this.store.consumeOAuth(state, cookie(req, OAUTH_COOKIE));
    res.clearCookie(OAUTH_COOKIE, options);
    if (!transaction || typeof req.query.code !== 'string') {
      res.redirect('/?authError=login'); return;
    }
    try {
      const { tokens } = await this.client.getToken({ code: req.query.code, codeVerifier: transaction.verifier });
      const ticket = await this.client.verifyIdToken({ idToken: tokens.id_token || '', audience: process.env.AUTH_GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      if (!payload?.sub || payload.email_verified !== true || !payload.email ||
          (payload as any).nonce !== transaction.nonce) throw new Error('Invalid identity');
      if (!this.store.isAllowed(payload.email)) { res.redirect('/?authError=forbidden'); return; }
      const token = this.store.issue({ sub: payload.sub, email: payload.email });
      this.store.revoke(cookie(req, SESSION_COOKIE));
      this.setSession(res, token);
      res.redirect(transaction.return_to);
    } catch {
      // Never log OAuth codes, provider responses, tokens or cookies.
      res.redirect('/?authError=login');
    }
  }
  logout(req: Request, res: Response) {
    this.store.revoke(cookie(req, SESSION_COOKIE));
    res.clearCookie(SESSION_COOKIE, options);
    res.status(204).end();
  }
}
