// Isolated local acceptance fixture. Fake Google sign-in only exists in this tool.
// Run after building both apps. No production credentials or user media are used.
import { createRequire } from 'node:module';
import { createServer, request as proxyRequest } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, sep } from 'node:path';
const root = await mkdtemp(resolve(tmpdir(), 'nmp-auth-preview-'));
const project = resolve(import.meta.dirname, '../..');
const require = createRequire(resolve(project, 'server-nestjs/package.json'));
const build = resolve(project, 'client/build');
Object.assign(process.env, {
  AUTH_ORIGIN: 'https://fixture.invalid', AUTH_GOOGLE_CLIENT_ID: 'fixture', AUTH_GOOGLE_CLIENT_SECRET: 'fixture',
  AUTH_DB_PATH: resolve(root, 'auth.sqlite'), LESSON_PLAN_DB_PATH: resolve(root, 'lessons.sqlite'),
  MUSIC_ROOT_PATH: resolve(root, 'music/songs'), PLAYLIST_DATA_PATH: resolve(root, 'playlists.json'),
  ATTENDANCE_IMAGE_DIR: resolve(root, 'photos'), AUDIO_CACHE_PATH: resolve(root, 'audio'), DOWNLOAD_WORK_PATH: resolve(root, 'downloads'),
});
await mkdir(resolve(root, 'music/songs/한글 폴더'), { recursive: true });
const wav = Buffer.alloc(44 + 16000); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16000, 40);
await writeFile(resolve(root, 'music/songs/한글 폴더/테스트 곡.wav'), wav);
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { AuthService, SESSION_COOKIE } = require('./dist/auth/auth.service');
const { configureBodyParsers } = require('./dist/common/body-parsers');
const app = await NestFactory.create(AppModule, { logger: false, bodyParser: false });
configureBodyParsers(app); await app.listen(0, '127.0.0.1');
const backendPort = app.getHttpServer().address().port;
const store = app.get(AuthService).store;
store.allow('fixture@example.test');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/auth/google/start') {
    const token = store.issue({ sub: 'fixture-user', email: 'fixture@example.test' });
    res.writeHead(302, { 'Set-Cookie': 'nmp_fixture=' + token + '; HttpOnly; Path=/; SameSite=Lax', Location: '/' }); res.end(); return;
  }
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/songs/')) {
    const token = /(?:^|;\s*)nmp_fixture=([^;]+)/.exec(req.headers.cookie || '')?.[1] || '';
    const upstream = proxyRequest({ hostname: '127.0.0.1', port: backendPort, path: req.url, method: req.method,
      headers: { ...req.headers, cookie: SESSION_COOKIE + '=' + token, origin: 'https://fixture.invalid' } }, reply => {
      const headers = { ...reply.headers }; delete headers['set-cookie'];
      res.writeHead(reply.statusCode, headers); reply.pipe(res);
    });
    upstream.on('error', () => { res.writeHead(502); res.end(); }); req.pipe(upstream); return;
  }
  const relative = ['/', '/lesson-notes', '/lesson-plans', '/attendance'].includes(url.pathname) ? 'index.html' : decodeURIComponent(url.pathname).slice(1);
  const path = resolve(build, relative);
  if (!path.startsWith(build + sep)) { res.writeHead(400); res.end(); return; }
  try { const bytes = await readFile(path); res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(bytes); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(4193, '127.0.0.1', resolve));
console.log('Isolated auth preview: http://127.0.0.1:4193');
async function stop() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await app.close(); await rm(root, { recursive: true, force: true }); process.exit(0); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
