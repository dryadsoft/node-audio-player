// Isolated production-build acceptance; never uses production cookies or data.
// PLAYWRIGHT_MODULE=/path/to/playwright PLAYWRIGHT_EXECUTABLE=/path/to/chrome node scripts/auth-recovery-check.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const port = Number(process.env.NOTE_PREVIEW_PORT || 4187);
const base = `http://127.0.0.1:${port}`;
const child = spawn(
  process.execPath,
  [resolve(import.meta.dirname, "offline-preview.mjs")],
  {
    env: { ...process.env, NOTE_PREVIEW_PORT: String(port) },
    stdio: ["pipe", "pipe", "pipe"],
  }
);
let output = "";
child.stdout.on("data", (d) => {
  output += d;
});
child.stderr.on("data", (d) => {
  output += d;
});
async function until(check, label, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error(`Timeout: ${label}`);
}
async function command(line, notice) {
  const offset = output.length;
  child.stdin.write(`${line}\n`);
  await until(() => output.slice(offset).includes(notice), line);
}
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
    : {}),
});
try {
  await until(() => output.includes("Preview:"), "fixture startup");
  const context = await browser.newContext({
    viewport: { width: 820, height: 1180 },
  });
  const page = await context.newPage();
  let navigations = 0;
  page.on("request", (r) => {
    if (r.isNavigationRequest() && r.url().includes("reauth=1")) navigations++;
  });
  await page.goto(base + "/");
  await page.getByRole("button", { name: "한글 수업 열기" }).click();
  await page.getByText("첫 곡.mp3", { exact: true }).waitFor();
  await command("auth", "Fixture authentication expired.");
  await until(() => navigations === 1, "automatic authentication navigation");
  await page.getByText("첫 곡.mp3", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "한글 수업", exact: true }).count(),
    1
  );
  console.log(
    "PASS HTTP 401 automatically reconnects once and restores Korean folder selection"
  );

  await command("auth-redirect", "Fixture auth-redirect enabled.");
  await until(() => navigations === 2, "opaque cross-origin redirect recovery");
  await page.getByText("첫 곡.mp3", { exact: true }).waitFor();
  console.log(
    "PASS real cross-origin 302 is recognized without following the CORS-blocked login fetch"
  );

  await page.getByRole("link", { name: "수업노트", exact: true }).click();
  const title = () =>
    page.getByRole("textbox", { name: "1주차 공통 수업명", exact: true });
  await title().waitFor();
  await title().focus();
  const before = await title().boundingBox();
  await command("auth", "Fixture authentication expired.");
  await page.getByRole("complementary", { name: "연결 상태" }).waitFor();
  await title().fill("인증 만료 중 보존할 수업명");
  await until(
    async () =>
      await page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const r = indexedDB.open("node-audio-player-drafts", 2);
            r.onerror = () => reject(r.error);
            r.onsuccess = () => {
              const db = r.result,
                tx = db.transaction("notes"),
                q = tx.objectStore("notes").getAll();
              q.onsuccess = () =>
                resolve(
                  q.result.some(
                    (n) =>
                      n.dirty &&
                      n.local.className === "인증 만료 중 보존할 수업명"
                  )
                );
              tx.oncomplete = () => db.close();
            };
          })
      ),
    "durable unsent draft"
  );
  assert.equal(navigations, 2);
  assert.deepEqual(await title().boundingBox(), before);
  if (process.env.AUTH_RECOVERY_ARTIFACT_DIR) {
    await mkdir(process.env.AUTH_RECOVERY_ARTIFACT_DIR, { recursive: true });
    await page.screenshot({
      path: resolve(
        process.env.AUTH_RECOVERY_ARTIFACT_DIR,
        "ipad-editing-auth.png"
      ),
      fullPage: true,
    });
  }
  await page
    .getByRole("complementary", { name: "연결 상태" })
    .getByRole("button", { name: "다시 로그인", exact: true })
    .click();
  await until(() => navigations === 3, "manual recovery after editing");
  await until(
    async () =>
      (await title()
        .inputValue()
        .catch(() => "")) === "인증 만료 중 보존할 수업명",
    "draft restored after authentication"
  );
  console.log(
    "PASS editing defers navigation, keeps editor geometry and preserves the IndexedDB draft across recovery"
  );

  await page.getByRole("link", { name: "음악 관리", exact: true }).click();
  await command("auth-loop", "Fixture auth-loop enabled.");
  await until(() => navigations === 4, "one attempt on unrecoverable login");
  await page
    .getByText("자동 재연결을 완료하지 못했습니다. 다시 로그인해 주세요.")
    .waitFor();
  await new Promise((r) => setTimeout(r, 2500));
  assert.equal(navigations, 4);
  await page.setViewportSize({ width: 390, height: 844 });
  const loginButton = page.getByRole("button", {
    name: "다시 로그인",
    exact: true,
  });
  const buttonBox = await loginButton.boundingBox();
  assert(buttonBox && buttonBox.x >= 0 && buttonBox.x + buttonBox.width <= 390);
  if (process.env.AUTH_RECOVERY_ARTIFACT_DIR) {
    await page.screenshot({
      path: resolve(
        process.env.AUTH_RECOVERY_ARTIFACT_DIR,
        "mobile-auth-retry.png"
      ),
    });
  }
  console.log(
    "PASS rejected/cancelled authentication stops after one navigation"
  );
  await command("clear-auth", "Fixture authentication restored.");
  await page
    .getByRole("button", { name: "연결 다시 확인", exact: true })
    .click();
  await until(
    async () =>
      (await page.getByRole("complementary", { name: "연결 상태" }).count()) ===
      0,
    "explicit recovery"
  );

  await context.setOffline(true);
  await page
    .getByText(
      "인터넷 연결이 끊겼습니다. 저장된 기록은 계속 사용할 수 있습니다."
    )
    .waitFor();
  assert.equal(navigations, 4);
  await context.setOffline(false);
  await until(
    async () =>
      (await page.getByRole("complementary", { name: "연결 상태" }).count()) ===
      0,
    "online event recovery"
  );
  console.log(
    "PASS network outage does not trigger authentication and reconnects when online"
  );
  await context.close();
} finally {
  await browser.close();
  child.kill("SIGTERM");
}
