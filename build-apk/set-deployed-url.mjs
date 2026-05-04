#!/usr/bin/env node
// Record the production URL the APK should target. After running this once,
// every `node build-apk/build.mjs` will automatically build an APK pointing
// at the deployed app — no env vars or flags required.
//
// Usage:
//   node build-apk/set-deployed-url.mjs https://your-app.replit.app
//   node build-apk/set-deployed-url.mjs --clear

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(here, "deployment.json");

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node build-apk/set-deployed-url.mjs <https://your-app.replit.app>");
  console.error("       node build-apk/set-deployed-url.mjs --clear");
  process.exit(1);
}

if (arg === "--clear") {
  if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
  console.log("Cleared stored deployed URL.");
  process.exit(0);
}

let url;
try {
  url = new URL(arg);
} catch {
  console.error(`ERROR: "${arg}" is not a valid URL.`);
  process.exit(1);
}
if (url.protocol !== "https:") {
  console.error("ERROR: Deployed URL must use https://");
  process.exit(1);
}

const normalized = `${url.protocol}//${url.host}`;
const payload = {
  deployedUrl: normalized,
  updatedAt: new Date().toISOString(),
};
fs.writeFileSync(configPath, JSON.stringify(payload, null, 2) + "\n");
console.log(`Saved deployed URL: ${normalized}`);
console.log(`Stored in: ${configPath}`);
console.log("Future APK builds will automatically use this URL.");
