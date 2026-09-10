// Isolated production-build preview. All writable storage is a fresh temporary directory.
import { createRequire } from "node:module";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, request as httpRequest } from "node:http";
import { createInterface } from "node:readline";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
  backend = resolve(root, "server-nestjs"),
  build = resolve(root, "client/build");
const data =
  process.argv[2] || (await mkdtemp(resolve(tmpdir(), "attendance-preview-")));
if (process.argv[2]) {
  if (
    !(
      await stat(resolve(data, ".attendance-preview")).catch(() => null)
    )?.isFile()
  )
    throw new Error("Not a preview directory");
} else await writeFile(resolve(data, ".attendance-preview"), "isolated");
process.env.LESSON_PLAN_DB_PATH = resolve(data, "lesson-plans.sqlite");
process.env.ATTENDANCE_IMAGE_DIR = resolve(data, "attendance");
process.env.PLAYLIST_DATA_PATH = resolve(data, "playlists.json");
process.env.AUDIO_CACHE_PATH = resolve(data, "audio");
process.env.DOWNLOAD_WORK_PATH = resolve(data, "downloads");
const require = createRequire(resolve(backend, "package.json"));
require("reflect-metadata");
const { NestFactory } = require("@nestjs/core"),
  { AppModule } = require(resolve(backend, "dist/app.module.js"));
const { SqliteService } = require(resolve(
    backend,
    "dist/database/sqlite.service.js"
  )),
  { LessonLocationService } = require(resolve(
    backend,
    "dist/lesson-plan/lesson-location.service.js"
  )),
  { AttendanceService } = require(resolve(
    backend,
    "dist/attendance/attendance.service.js"
  ));
const app = await NestFactory.create(AppModule, { logger: false, bodyParser: false });
require(resolve(backend, "dist/common/body-parsers")).configureBodyParsers(app);
await app.listen(4001, "127.0.0.1");
const db = app.get(SqliteService),
  locations = new LessonLocationService(db),
  attendance = app.get(AttendanceService);
if (
  !db.database.prepare("SELECT COUNT(*) AS n FROM attendance_centers").get().n
)
  for (const name of ["샘플 서초센터", "샘플 강남센터"]) {
    const location = locations.create(name),
      center = attendance.saveCenter({
        year: 2026,
        term: "fall",
        locationId: location.id,
        weekday: 2,
      });
    for (const name of ["유아반", "2교시", "특별반"])
      attendance.createPeriod({ centerId: center.id, name });
  }
let server,
  auth = false;
const start = async () => {
  if (server) return;
  server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, "http://localhost").pathname;
      if (path.startsWith("/api/") || path.startsWith("/songs/")) {
        if (auth && path.startsWith("/api/")) {
          res.writeHead(200, { "content-type": "text/html" });
          res.end("<html>Test login</html>");
          return;
        }
        const proxy = httpRequest(
          {
            hostname: "127.0.0.1",
            port: 4001,
            path: req.url,
            method: req.method,
            headers: req.headers,
          },
          (up) => {
            res.writeHead(up.statusCode, up.headers);
            up.pipe(res);
          }
        );
        proxy.on("error", () => {
          res.writeHead(502);
          res.end();
        });
        req.pipe(proxy);
        return;
      }
      if (
        new URL(req.url, "http://localhost").searchParams.get("reauth") === "1"
      )
        auth = false;
      if (path === "/__fixture.jpg") {
        res.writeHead(200, { "content-type": "image/jpeg" });
        res.end(await readFile("/tmp/attendance-paper.jpg"));
        return;
      }
      let file = resolve(build, "." + decodeURIComponent(path));
      if (!file.startsWith(build + sep) && file !== build) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (!(await stat(file).catch(() => null))?.isFile())
        file = resolve(build, "index.html");
      const types = {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".jpg": "image/jpeg",
      };
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(await readFile(file));
    } catch {
      res.writeHead(500);
      res.end();
    }
  });
  await new Promise((r) => server.listen(4174, "127.0.0.1", r));
  console.log("online http://127.0.0.1:4174/attendance");
};
await start();
console.log(`temporary data: ${data}`);
console.log("commands: offline, online, auth, state, quit");
const lines = createInterface({ input: process.stdin, output: process.stdout });
for await (const command of lines) {
  if (command === "offline" && server) {
    const old = server;
    server = undefined;
    old.closeAllConnections();
    await new Promise((r) => old.close(r));
    console.log("offline");
  } else if (command === "online") await start();
  else if (command === "auth") {
    auth = true;
    console.log("test authentication expired");
  } else if (command === "state") {
    console.log(
      db.database
        .prepare(
          "SELECT id,revision,deleted_at,json_array_length(json_extract(ink_json,'$.strokes')) AS strokes FROM attendance_pages"
        )
        .all()
    );
  } else if (command === "quit") {
    if (server) {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
    await app.close();
    lines.close();
    break;
  }
}
