// Isolated PWA acceptance fixture. Serves the real build; never reads application data.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { createInterface } from "node:readline";
let root = resolve(process.env.NOTE_PREVIEW_BUILD || resolve(import.meta.dirname, "../build"));
const port = Number(process.env.NOTE_PREVIEW_PORT || 4173);
let revision = 0,
  auth = false,
  brokenUpdate = false;
const makeWeek = (week) => ({
  week,
  className: week === 1 ? "첫 만남" : "",
  content: "오프라인 검증용 수업",
  revision: 1,
  updatedAt: "2026-09-09T00:00:00.000Z",
  hasInk: false,
  inkDocument: { version: 2, aspectRatio: 4 / 3, pageCount: 2, strokes: [] },
});
const notes = ["sample-1", "sample-2"].map((id, i) => ({
  id,
  year: 2026,
  term: i ? "winter" : "fall",
  programName: i ? "겨울 놀이" : "오감별",
  completedWeeks: 1,
  linkedPlanCount: 0,
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
  weeks: Array.from({ length: 12 }, (_, i) => makeWeek(i + 1)),
}));
const summary = ({ weeks, ...value }) => value;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const json = (value, status = 200) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(value));
    };
    if (url.searchParams.has("reauth")) auth = false;
    if (auth && url.pathname.startsWith("/api/")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<h1>Fixture login required</h1>");
      return;
    }
    if (url.pathname === "/api/lesson-curricula") {
      json(notes.map(summary));
      return;
    }
    const match = url.pathname.match(
      /^\/api\/lesson-curricula\/([^/]+)(?:\/weeks\/(\d+))?$/
    );
    if (match) {
      const item = notes.find((n) => n.id === decodeURIComponent(match[1]));
      if (!item) {
        json({ message: "없음" }, 404);
        return;
      }
      if (!match[2]) {
        json({
          ...summary(item),
          weeks: item.weeks.map(({ inkDocument, ...w }) => w),
        });
        return;
      }
      const week = item.weeks[Number(match[2]) - 1];
      if (!week) {
        json({ message: "없음" }, 404);
        return;
      }
      if (req.method === "PUT") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const input = JSON.parse(body);
        if (input.expectedRevision !== week.revision) {
          json({ message: "충돌" }, 409);
          return;
        }
        Object.assign(week, {
          className: input.className,
          content: input.content,
          inkDocument: input.inkDocument,
          revision: week.revision + 1,
          updatedAt: new Date(
            Date.UTC(2026, 8, 9, 0, 0, ++revision)
          ).toISOString(),
        });
        item.updatedAt = week.updatedAt;
      }
      json(week);
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      json(
        url.pathname === "/api/playlist" ? { directory: [], playlist: [] } : []
      );
      return;
    }
    let file = resolve(root, "." + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + sep) && file !== root) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!extname(file)) file = resolve(root, "index.html");
    if (url.pathname.endsWith("broken-update.js")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<h1>Fixture login</h1>");
      return;
    }
    let body = await readFile(file);
    if (brokenUpdate && url.pathname === "/service-worker.js")
      body = Buffer.from(
        body
          .toString()
          .replace(/static\/js\/main\.[^"']+\.js/, "static/js/broken-update.js")
      );
    const type =
      {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
      }[extname(file)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end("Fixture error");
  }
});
const listen = () =>
  server.listen(port, "127.0.0.1", () =>
    console.log(`Preview: http://127.0.0.1:${port}/lesson-notes`)
  );
listen();
console.log(
  "Commands: build <directory>, offline, online, auth, bad-update, good-update, state, quit"
);
createInterface({ input: process.stdin }).on("line", (line) => {
  if (line.startsWith("build ")) {
    root = resolve(line.slice(6));
    console.log("Fixture build changed.");
  }
  if (line === "offline") {
    server.closeAllConnections();
    server.close(() =>
      console.log("Fixture server offline; records retained.")
    );
  }
  if (line === "online" && !server.listening) listen();
  if (line === "auth") {
    auth = true;
    console.log("Fixture authentication expired.");
  }
  if (line === "bad-update") {
    brokenUpdate = true;
    console.log("Invalid asset response enabled for update test.");
  }
  if (line === "good-update") brokenUpdate = false;
  if (line === "state")
    console.log(
      JSON.stringify(
        notes.map((n) => ({
          id: n.id,
          weeks: n.weeks
            .filter((w) => w.revision > 1)
            .map((w) => ({
              week: w.week,
              className: w.className,
              revision: w.revision,
            })),
        }))
      )
    );
  if (line === "quit") {
    server.closeAllConnections();
    server.close();
    process.exit(0);
  }
});
