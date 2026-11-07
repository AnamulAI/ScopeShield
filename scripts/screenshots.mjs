// Saves full-page screenshots of the running app (npm run pages:dev) into docs/screenshots/ using headless Chrome over CDP.
// Usage: node scripts/screenshots.mjs   (needs Google Chrome installed; Node 22+ for the global WebSocket)
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.SHOT_BASE_URL ?? "http://localhost:8788";
const PORT = 9333;
const SHOTS = [
  ["desktop-bakery", 1280, "/#sample=bakery"],
  ["desktop-brand-open", 1280, "/#sample=brand-studio&open=1"],
  ["desktop-fitness", 1280, "/#sample=fitness-app"],
  ["tablet-bakery", 768, "/#sample=bakery"],
  ["mobile-brand-open", 375, "/#sample=brand-studio&open=1"],
  ["mobile-hero", 375, "/#sample=bakery", { hero: true }],
];

mkdirSync("docs/screenshots", { recursive: true });
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "ss-"))}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.length) break; } catch {} await sleep(250); }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const waiters = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiters.has(d.id)) { waiters.get(d.id)(d); waiters.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; waiters.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

for (const [name, width, path, opts] of SHOTS) {
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 });
  await send("Page.navigate", { url: "about:blank" }); // hash-only changes do not reload, so leave the page first
  await sleep(300);
  await send("Page.navigate", { url: `${BASE}${path}` });
  await sleep(4000);
  const h = (await send("Runtime.evaluate", { expression: "document.documentElement.scrollHeight", returnByValue: true })).result.result.value;
  const height = opts?.hero ? Math.min(h, 1700) : Math.min(h, 7000);
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
  writeFileSync(`docs/screenshots/${name}.png`, Buffer.from(shot.result.data, "base64"));
  console.log(name, width, height);
}
ws.close(); chrome.kill();
