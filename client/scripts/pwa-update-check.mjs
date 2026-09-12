// Opt-in real-browser acceptance. Two production builds with distinct build IDs are required.
// PLAYWRIGHT_MODULE=/path/to/playwright node scripts/pwa-update-check.mjs /tmp/build-A /tmp/build-B
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const [buildA, buildB] = process.argv.slice(2).map((p) => resolve(p));
assert(buildA && buildB, "Provide build A and B directories");
const idA = JSON.parse(await readFile(resolve(buildA, "version.json"))).buildId;
const idB = JSON.parse(await readFile(resolve(buildB, "version.json"))).buildId;
assert.notEqual(idA, idB);
const scriptA = JSON.parse(
  await readFile(resolve(buildA, "asset-manifest.json"))
).files["main.js"];
const scriptB = JSON.parse(
  await readFile(resolve(buildB, "asset-manifest.json"))
).files["main.js"];
const port = process.env.NOTE_PREVIEW_PORT || "4186";
const url = `http://127.0.0.1:${port}/lesson-notes`;
const child = spawn(
  process.execPath,
  [resolve(import.meta.dirname, "offline-preview.mjs")],
  {
    env: {
      ...process.env,
      NOTE_PREVIEW_PORT: port,
      NOTE_PREVIEW_BUILD: buildA,
    },
    stdio: ["pipe", "pipe", "pipe"],
  }
);
let output = "";
child.stdout.on("data", (data) => {
  output += data;
});
child.stderr.on("data", (data) => {
  output += data;
});
async function until(check, description, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timeout: ${description}`);
}
async function command(line, notice) {
  const before = output.length;
  child.stdin.write(`${line}\n`);
  if (notice) await until(() => output.slice(before).includes(notice), line);
}
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
    : {}),
});
try {
  await until(() => output.includes("Preview:"), "fixture startup");
  const context = await browser.newContext();
  const a = await context.newPage(),
    b = await context.newPage();
  const title = (p) =>
    p.getByRole("textbox", { name: "1주차 공통 수업명", exact: true });
  const version = (p) =>
    p.evaluate(
      () =>
        new Promise((resolve) => {
          const ch = new MessageChannel();
          const timer = setTimeout(() => {
            ch.port1.close();
            resolve("");
          }, 2000);
          ch.port1.onmessage = (e) => {
            clearTimeout(timer);
            ch.port1.close();
            resolve(e.data.buildId);
          };
          navigator.serviceWorker.controller?.postMessage(
            { type: "GET_BUILD" },
            [ch.port2]
          );
        })
    );
  const loaded = async (p, script) =>
    (await p.locator(`script[src="${script}"]`).count()) === 1 &&
    (await title(p).isVisible());
  const records = (p) =>
    p.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open("node-audio-player-drafts", 2);
          r.onerror = () => reject(r.error);
          r.onsuccess = () => {
            const db = r.result;
            const tx = db.transaction("notes");
            const q = tx.objectStore("notes").getAll();
            q.onsuccess = () => resolve(q.result);
            tx.oncomplete = () => db.close();
          };
        })
    );
  await a.goto(url);
  await until(() => loaded(a, scriptA), "A editor");
  await until(async () => (await version(a)) === idA, "A worker");
  await b.goto(url);
  await until(() => loaded(b, scriptA), "second A tab");
  await title(b).fill("배포 전 보존할 수업명");
  await until(
    async () =>
      (
        await records(b)
      ).some((n) => n.local.className === "배포 전 보존할 수업명" && !n.dirty),
    "initial save"
  );
  await command(`build ${buildB}`, "Fixture build changed.");
  await command("bad-update", "Invalid asset response");
  await a.reload();
  await until(() => loaded(a, scriptA), "failed update keeps A");
  await until(
    async () =>
      await a.evaluate(
        async () =>
          (await navigator.serviceWorker.getRegistration()).installing === null
      ),
    "failed worker settles"
  );
  assert.equal(await version(a), idA);
  console.log("PASS invalid update retains working release");
  await command("good-update");
  await a.reload();
  await until(() => loaded(a, scriptB), "one reload applies B");
  assert.equal(await version(a), idB);
  assert(await loaded(b, scriptA));
  await b.getByRole("button", { name: "새 버전 적용", exact: true }).waitFor();
  assert((await b.evaluate(() => caches.keys())).some((n) => n.endsWith(idA)));
  console.log(
    "PASS one reload applies B; other tab stays A with update notice and old cache"
  );
  await title(b).dispatchEvent("compositionstart");
  await b.getByRole("button", { name: "새 버전 적용", exact: true }).click();
  await b.getByRole("alert").filter({ hasText: "기기 저장을 마친" }).waitFor();
  assert(await loaded(b, scriptA));
  await title(b).dispatchEvent("compositionend");
  await b.getByRole("button", { name: "새 공통 원본", exact: true }).click();
  await b.getByRole("button", { name: "새 버전 적용", exact: true }).click();
  await b.getByRole("alert").filter({ hasText: "관리 입력" }).waitFor();
  await b
    .locator(".curriculum-create")
    .getByRole("button", { name: "취소", exact: true })
    .click();
  console.log("PASS IME composition and open management form block update");
  await command("offline", "Fixture server offline");
  assert.equal(
    await b.evaluate(
      async (src) => (await fetch(src, { cache: "no-store" })).status,
      scriptA
    ),
    200
  );
  await title(b).fill("오프라인 업데이트 후에도 보존");
  const canvas = b.getByLabel("Apple Pencil 필기 영역 1페이지", {
    exact: true,
  });
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await b.mouse.move(box.x + 60, box.y + 60);
  await b.mouse.down();
  await b.mouse.move(box.x + 150, box.y + 90, { steps: 8 });
  await b.mouse.up();
  await until(
    async () =>
      (
        await records(b)
      ).some(
        (n) =>
          n.local.className === "오프라인 업데이트 후에도 보존" &&
          n.local.inkDocument.strokes.length > 0 &&
          n.dirty
      ),
    "offline text and ink stored"
  );
  await b.screenshot({
    path: process.env.PWA_SCREENSHOT || "/tmp/nmp-pwa-update-banner.png",
  });
  await b.getByRole("button", { name: "새 버전 적용", exact: true }).click();
  await until(() => loaded(b, scriptB), "offline update opens B");
  assert.equal(await title(b).inputValue(), "오프라인 업데이트 후에도 보존");
  assert(
    (await records(b)).some(
      (n) => n.local.inkDocument.strokes.length > 0 && n.dirty
    )
  );
  console.log(
    "PASS old asset available offline; text and stroke survive offline update"
  );
  await b.reload();
  await until(() => loaded(b, scriptB), "offline restart");
  assert.equal(await title(b).inputValue(), "오프라인 업데이트 후에도 보존");
  await command("online", "Preview:");
  await b.bringToFront();
  await until(
    async () =>
      (
        await records(b)
      ).some(
        (n) =>
          n.local.className === "오프라인 업데이트 후에도 보존" &&
          n.local.inkDocument.strokes.length > 0 &&
          !n.dirty
      ),
    "reconnect sync",
    40000
  );
  await b.evaluate(async () => {
    await navigator.serviceWorker.getRegistration().then((r) => r.update());
  });
  await version(b);
  // If the worker was terminated, old-cache GC resumes at the next activation.
  assert(await loaded(b, scriptB));
  console.log("PASS offline restart and reconnect sync; no reload loop");
  await context.close();
} finally {
  await browser.close();
  child.stdin.write("quit\n");
  await new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(() => {
      child.kill();
      resolve();
    }, 3000).unref();
  });
}
