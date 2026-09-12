import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const commit =
  spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    encoding: "utf8",
  }).stdout?.trim() || "local";
const buildId =
  process.env.REACT_APP_BUILD_ID ||
  `${commit}-${Date.now()}-${randomBytes(3).toString("hex")}`;
if (!/^[a-zA-Z0-9-]{1,100}$/.test(buildId)) throw new Error("Invalid build ID");
const result = spawnSync(
  process.execPath,
  [require.resolve("react-scripts/scripts/build")],
  {
    stdio: "inherit",
    env: { ...process.env, REACT_APP_BUILD_ID: buildId },
  },
);
if (result.status !== 0) process.exit(result.status || 1);
writeFileSync("build/version.json", JSON.stringify({ buildId }) + "\n");
