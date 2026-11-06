import { createHash, randomBytes } from 'crypto';
import { chmodSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { loadSqlite, SqliteDatabase } from '../database/sqlite.types';

export interface SessionIdentity {
  sub: string;
  email: string;
}

const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Persistent, revocable sessions. Raw bearer tokens never enter the database. */
export class SessionStore {
  private readonly db: SqliteDatabase;

  constructor(path: string) {
    const filename = resolve(path);
    mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new (loadSqlite().DatabaseSync)(filename, {
      timeout: 5000,
      enableForeignKeyConstraints: true,
    });
    try {
      chmodSync(filename, 0o600);
      this.db.exec(`
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 5000;
        CREATE TABLE IF NOT EXISTS allowed_emails (
          email TEXT PRIMARY KEY
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          sub TEXT NOT NULL,
          email TEXT NOT NULL REFERENCES allowed_emails(email) ON DELETE CASCADE,
          created_at INTEGER NOT NULL,
          renewed_at INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS sessions_email ON sessions(email);
        CREATE TABLE IF NOT EXISTS oauth_transactions (
          state_hash TEXT PRIMARY KEY, binding_hash TEXT NOT NULL,
          nonce TEXT NOT NULL, verifier TEXT NOT NULL, return_to TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        );
      `);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  allow(email: string) {
    const normalized = normalizeEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
      throw new Error('Invalid email');
    this.db.prepare('INSERT OR IGNORE INTO allowed_emails(email) VALUES (?)')
      .run(normalized);
  }

  /** Removing and re-adding an email must never resurrect old sessions. */
  remove(email: string) {
    this.db.prepare('DELETE FROM allowed_emails WHERE email = ?')
      .run(normalizeEmail(email));
  }

  isAllowed(email: string): boolean {
    return !!this.db.prepare('SELECT email FROM allowed_emails WHERE email = ?')
      .get(normalizeEmail(email));
  }

  /** Only call after verifying Google's ID token, including email_verified. */
  issue(identity: SessionIdentity): string {
    const email = normalizeEmail(identity.email);
    if (!identity.sub || !this.isAllowed(email))
      throw new Error('Identity is not allowed');
    const token = randomBytes(32).toString('base64url');
    this.db.prepare(`INSERT INTO sessions(token_hash, sub, email, created_at)
      VALUES (?, ?, ?, ?)`).run(digest(token), identity.sub, email, Date.now());
    return token;
  }

  authenticate(token: string): SessionIdentity | undefined {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
    return this.db.prepare(`SELECT s.sub, s.email FROM sessions s
      JOIN allowed_emails a ON a.email = s.email WHERE s.token_hash = ?`)
      .get(digest(token)) as SessionIdentity | undefined;
  }

  renew(token: string): boolean {
    return this.db.prepare(`UPDATE sessions SET renewed_at = ?
      WHERE token_hash = ? AND renewed_at <= ?`)
      .run(Date.now(), digest(token), Date.now() - 86400000).changes === 1;
  }

  beginOAuth(binding: string, nonce: string, verifier: string, returnTo: string): string {
    this.db.prepare('DELETE FROM oauth_transactions WHERE expires_at <= ?').run(Date.now());
    const count = this.db.prepare('SELECT COUNT(*) AS n FROM oauth_transactions').get() as { n: number };
    if (count.n >= 1000) throw new Error('Too many login attempts');
    const state = randomBytes(32).toString('base64url');
    this.db.prepare(`INSERT INTO oauth_transactions VALUES (?, ?, ?, ?, ?, ?)`)
      .run(digest(state), digest(binding), nonce, verifier, returnTo, Date.now() + 600000);
    return state;
  }

  consumeOAuth(state: string, binding: string): { nonce: string; verifier: string; return_to: string } | undefined {
    return this.db.prepare(`DELETE FROM oauth_transactions
      WHERE state_hash = ? AND binding_hash = ? AND expires_at > ?
      RETURNING nonce, verifier, return_to`)
      .get(digest(state), digest(binding), Date.now()) as any;
  }

  revoke(token: string) {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token));
  }

  revokeAll(email: string) {
    this.db.prepare('DELETE FROM sessions WHERE email = ?').run(normalizeEmail(email));
  }

  close() {
    this.db.close();
  }
}
