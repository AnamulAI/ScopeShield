// Saves full-page screenshots of the running app (npm run pages:dev) into docs/screenshots/ using headless Chrome over CDP.
// Usage: node scripts/screenshots.mjs   (needs Google Chrome installed; Node 22+ for the global WebSocket)
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.SHOT_BASE_URL ?? "http://localhost:8788";
const PORT = 9333;
// Clip of one element (page coordinates) after optional setup.
const elementShot = async (name, width, hash, opts = {}) => {
  await send("Emulation.setDeviceMetricsOverride", { width, height: width < 500 ? 812 : 900, deviceScaleFactor: 1, mobile: width < 500 });
  await send("Emulation.setEmulatedMedia", { features: opts.reduced === false ? [] : [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Page.navigate", { url: "about:blank" }); await sleep(300);
  await send("Page.navigate", { url: `${BASE}/${hash}` }); await sleep(3500);
  const sel = JSON.stringify(opts.selector ?? "#chat-window");
  if (width < 500 && !opts.selector) await send("Runtime.evaluate", { expression: "[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Thread').click()" });
  await send("Runtime.evaluate", { expression: `document.querySelector(${sel}).scrollIntoView({ block: 'start' })` });
  await sleep(400);
  if (opts.pre) { await send("Runtime.evaluate", { expression: opts.pre }); await sleep(500); }
  await sleep(opts.wait ?? 500);
  const r = (await send("Runtime.evaluate", { expression: `(() => { const b = document.querySelector(${sel}).getBoundingClientRect(); return { x: b.x + scrollX, y: b.y + scrollY, w: b.width, h: b.height }; })()`, returnByValue: true })).result.result.value;
  const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: Math.max(0, r.x - 16), y: Math.max(0, r.y - 16), width: Math.min(width, r.w + 32), height: Math.min(r.h + 32, opts.maxHeight ?? 4000), scale: 1 } });
  writeFileSync(`docs/screenshots/${name}.png`, Buffer.from(shot.result.data, "base64"));
  console.log(name, Math.round(r.w), Math.round(r.h));
};

const SHOTS = [
  ["desktop-bakery", 1280, "/#sample=bakery"],
  ["desktop-top", 1280, "/#sample=bakery", { hero: true, tall: 1300 }],
  ["desktop-brand-open", 1280, "/#sample=brand-studio&open=1"],
  ["desktop-fitness", 1280, "/#sample=fitness-app"],
  ["desktop-pushy", 1280, "/#sample=pushy-client"],
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

const heroClip = async (name, width, setup) => {
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "about:blank" });
  await sleep(300);
  if (setup.reduced) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  else await send("Emulation.setEmulatedMedia", { features: [] });
  await send("Page.navigate", { url: `${BASE}/#sample=bakery` });
  await sleep(setup.freezeAt ? 700 : 4500);
  if (setup.freezeAt) await send("Runtime.evaluate", { expression: `document.getAnimations().filter(a=>/flow|shield|fade/.test(a.animationName||'')).forEach(a=>{a.pause();a.currentTime=${setup.freezeAt}})` });
  await sleep(300);
  const n = (await send("Runtime.evaluate", { expression: "document.getAnimations().filter(a=>/flow|shield|fade|rise/.test(a.animationName||'')).length", returnByValue: true })).result.result.value;
  const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 40, width, height: 520, scale: 1 } });
  writeFileSync(`docs/screenshots/${name}.png`, Buffer.from(shot.result.data, "base64"));
  console.log(name, "running animations:", n);
  await send("Emulation.setEmulatedMedia", { features: [] });
};

for (const [name, width, path, opts] of SHOTS) {
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }); // finished thread, final values
  await send("Page.navigate", { url: "about:blank" }); // hash-only changes do not reload, so leave the page first
  await sleep(300);
  await send("Page.navigate", { url: `${BASE}${path}` });
  await sleep(4000);
  const h = (await send("Runtime.evaluate", { expression: "document.documentElement.scrollHeight", returnByValue: true })).result.result.value;
  const height = opts?.tall ? Math.min(h, opts.tall) : opts?.hero ? Math.min(h, 1700) : Math.min(h, 7000);
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
  writeFileSync(`docs/screenshots/${name}.png`, Buffer.from(shot.result.data, "base64"));
  console.log(name, width, height);
}
await elementShot("desktop-thread-chat", 1280, "#sample=bakery");
await elementShot("desktop-thread-chat-replay", 1280, "#sample=brand-studio", { reduced: false, wait: 5200 });
await elementShot("mobile-thread-tab", 375, "#sample=bakery");
await elementShot("desktop-thread-chat-guard", 1280, "#sample=pushy-client", { pre: "(() => { const m = document.querySelector('#msg-7'); const b = document.querySelector('#chat-window [role=log]'); b.scrollTop = m.getBoundingClientRect().top - b.getBoundingClientRect().top + b.scrollTop - 90; })()" });
await elementShot("safety-evidence", 1280, "#sample=pushy-client", { selector: 'section[aria-label="Safety and evidence"]', pre: "(() => { document.getElementById('evidence-pack').open = true; window.scrollBy(0, -70); })()", maxHeight: 1500 });
await elementShot("governing-clause", 1280, "#sample=pushy-client", { selector: "#card-12-0", pre: "window.scrollBy(0, -90)", maxHeight: 1400 });
await elementShot("evidence-pack-open", 1280, "#sample=pushy-client", { selector: "#evidence-pack", pre: "(() => { const d = document.getElementById('evidence-pack'); d.open = true; const sel = d.querySelector('select'); if (sel) { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, '12-0'); sel.dispatchEvent(new Event('change', { bubbles: true })); } window.scrollBy(0, -90); })()", wait: 900, maxHeight: 1400 });
await elementShot("client-supplied-script", 1280, "#sample=pushy-client", { selector: "[data-script-row]", pre: "window.scrollBy(0, -90)", maxHeight: 700 });
await send("Emulation.setEmulatedMedia", { features: [] });
await heroClip("hero-mid-animation", 1280, { freezeAt: 1500 });
await heroClip("hero-reduced-motion", 1280, { reduced: true });
ws.close(); chrome.kill();
