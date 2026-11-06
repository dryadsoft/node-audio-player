import { resolve } from 'path';
import { SessionStore } from './session-store';

// Supply an email on stdin to keep it out of process arguments and shell history.
async function main() {
  const action = process.argv[2];
  if (!['allow', 'remove', 'revoke'].includes(action))
    throw new Error('Usage: auth:admin allow|remove|revoke (email on stdin)');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 4096) throw new Error('Input too large');
  }
  const email = input.trim();
  if (!email || /\s/.test(email)) throw new Error('Provide exactly one email');
  const store = new SessionStore(process.env.AUTH_DB_PATH || resolve(process.cwd(), 'data/auth.sqlite'));
  try {
    if (action === 'allow') store.allow(email);
    if (action === 'remove') store.remove(email);
    if (action === 'revoke') store.revokeAll(email);
    process.stdout.write('Done\n');
  } finally { store.close(); }
}
main().catch(() => { process.stderr.write('Auth administration failed; check action, input and database path.\n'); process.exitCode = 1; });
