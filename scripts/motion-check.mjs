// Scripted browser check of the motion layer (needs `npm run pages:dev` and Google Chrome). Exit code 1 on any failure.
//   node scripts/motion-check.mjs
// Also checks the thread replay, filter chips, collapsed groups, Findings/Thread tabs, header and footer links.
// Checks, at 1280px and 375px, that probability bars and counters always end at their REAL values:
//   1 scrolling to far-below-the-fold cards, in all three samples, after switching samples, and after resolving/undoing an Ask me card
//   2 IntersectionObserver missing, or animations/rAF failing
//   3 print media and a full-page screenshot
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.SHOT_BASE_URL ?? "http://localhost:8788";
const PORT = 9555;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "mc-"))}`, "about:blank"], { stdio: "ignore" });
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.length) break; } catch {} await sleep(250); }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const waiters = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiters.has(d.id)) { waiters.get(d.id)(d); waiters.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; waiters.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("  FAIL:", msg); } };

// Page-side helpers, installed on every new document.
const HELPERS = `
window.__bars = () => [...document.querySelectorAll('.bar-fill')].map((f) => {
  const track = f.parentElement.parentElement; const clip = f.parentElement;
  const pct = parseFloat(clip.style.width);
  const trackW = track.getBoundingClientRect().width, clipW = clip.getBoundingClientRect().width;
  const r = f.getBoundingClientRect(), c = clip.getBoundingClientRect();
  return { transform: getComputedStyle(f).transform, running: f.getAnimations().filter((a) => a.playState === 'running').length, label: track.getAttribute('aria-label'),
           widthOk: Math.abs(clipW - trackW * pct / 100) < 1.5, fillCoversClip: Math.abs(r.left - c.left) < 1 && Math.abs(r.width - c.width) < 1 };
});
window.__counters = () => [...document.querySelectorAll('[aria-label="Scope health"] .sr-only')].map((s) => ({ real: s.textContent, shown: s.previousElementSibling.textContent }));
window.__scrollAll = async () => { document.querySelector('[aria-label="Scope health"]')?.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 900)); for (const f of document.querySelectorAll('.bar-fill')) { f.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 60)); } };
`;
const isFinalTransform = (t) => t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)";
const bad = (bars) => bars.filter((b) => !isFinalTransform(b.transform) || b.running > 0 || !b.widthOk || !b.fillCoversClip);

await send("Page.enable");
let scriptId = null;
async function load(width, hash, pre = "") {
  await send("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 1, mobile: width < 500 });
  await send("Page.navigate", { url: "about:blank" }); await sleep(150);
  if (scriptId) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: scriptId });
  scriptId = (await send("Page.addScriptToEvaluateOnNewDocument", { source: pre + HELPERS })).result.identifier;
  await send("Page.navigate", { url: `${BASE}/${hash}` });
  await sleep(2500);
}
const settle = async () => { await ev("window.__scrollAll()"); await sleep(1100); };

for (const width of [1280, 375]) {
  console.log(`\n=== ${width}px ===`);
  // 1) scroll to far-below-the-fold cards, every sample, fresh load
  for (const sample of ["bakery", "fitness-app", "brand-studio"]) {
    await load(width, `#sample=${sample}`);
    const n = await ev("document.querySelectorAll('.bar-fill').length");
    await settle();
    const b = bad(await ev("window.__bars()"));
    console.log(`scroll ${sample}: ${n} bars, ${b.length} not at final value`);
    ok(n > 0 && b.length === 0, `${sample}: bars after scrolling (${JSON.stringify(b.slice(0, 2))})`);
    const c = await ev("window.__counters()");
    ok(c.length > 0 && c.every((x) => x.real === x.shown), `${sample}: counters ${JSON.stringify(c.filter((x) => x.real !== x.shown))}`);
  }
  // 1b) switching samples in the same page
  await load(width, "#sample=bakery");
  for (const title of ["Fitness app MVP", "Brand identity", "Bakery website"]) {
    await ev(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(title)}).click()`);
    await sleep(900); await settle();
    const b = bad(await ev("window.__bars()"));
    console.log(`switch to ${title}: ${b.length} bars not final`);
    ok(b.length === 0, `switch ${title}: ${JSON.stringify(b.slice(0, 2))}`);
    const c = await ev("window.__counters()");
    ok(c.every((x) => x.real === x.shown), `switch ${title}: counters ${JSON.stringify(c)}`);
  }
  // 1c) resolve an Ask me card, then Undo (cards re-render / move queues)
  await load(width, "#sample=brand-studio");
  await settle();
  await ev(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Extra work')).click()`); await sleep(900); await settle();
  let b = bad(await ev("window.__bars()"));
  ok(b.length === 0, `after Extra work: ${JSON.stringify(b.slice(0, 2))}`);
  let c = await ev("window.__counters()");
  ok(c.every((x) => x.real === x.shown), `after Extra work counters ${JSON.stringify(c)}`);
  await ev(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim().endsWith('Undo')).click()`); await sleep(900); await settle();
  b = bad(await ev("window.__bars()"));
  console.log(`resolve + undo: ${b.length} bars not final`);
  ok(b.length === 0, `after Undo: ${JSON.stringify(b.slice(0, 2))}`);
  c = await ev("window.__counters()");
  ok(c.every((x) => x.real === x.shown), `after Undo counters ${JSON.stringify(c)}`);

  // 2) IntersectionObserver missing: final values immediately, no scrolling
  await load(width, "#sample=bakery", "window.IntersectionObserver = undefined;");
  b = bad(await ev("window.__bars()"));
  c = await ev("window.__counters()");
  console.log(`no IntersectionObserver: ${b.length} bars not final, counters ${c.every((x) => x.real === x.shown) ? "final" : "WRONG"}`);
  ok(b.length === 0, `no IO bars ${JSON.stringify(b.slice(0, 2))}`);
  ok(c.length > 0 && c.every((x) => x.real === x.shown), `no IO counters ${JSON.stringify(c)}`);
  // 2b) animation API throws and rAF never fires
  await load(width, "#sample=bakery", "Element.prototype.animate = function(){ throw new Error('animate failed'); }; window.requestAnimationFrame = () => 0;");
  await settle(); await sleep(1500);
  b = bad(await ev("window.__bars()"));
  c = await ev("window.__counters()");
  console.log(`animate() throws + no rAF: ${b.length} bars not final, counters ${c.every((x) => x.real === x.shown) ? "final" : "WRONG"}`);
  ok(b.length === 0, `animate fails bars ${JSON.stringify(b.slice(0, 2))}`);
  ok(c.every((x) => x.real === x.shown), `rAF dead counters ${JSON.stringify(c)}`);

  // 3) print media and a full-page screenshot (nothing has been scrolled to)
  await load(width, "#sample=fitness-app");
  await send("Emulation.setEmulatedMedia", { media: "print" });
  await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  b = bad(await ev("window.__bars()"));
  c = await ev("window.__counters()");
  console.log(`print + full-page screenshot (no scrolling): ${b.length} bars not final, counters ${c.every((x) => x.real === x.shown) ? "final" : "WRONG"}`);
  ok(b.length === 0, `print/full-page bars ${JSON.stringify(b.slice(0, 2))}`);
  ok(c.every((x) => x.real === x.shown), `print counters ${JSON.stringify(c)}`);
  await send("Emulation.setEmulatedMedia", { media: "" });

  // ===== v2: replay, filters, collapsed groups, tabs, header/footer =====
  const hiddenCount = "document.querySelectorAll('li[data-hidden=\"true\"]').length";
  const msgCount = "document.querySelectorAll('ol[aria-label^=\"Thread\"] > li').length";
  const apiCalls = "performance.getEntriesByType('resource').filter((e) => new URL(e.name).pathname.startsWith('/api/')).length";
  const clickText = (t, scope = "document") => ev(`[...${scope}.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(t)})).click()`);
  const showThread = async () => {
    if (width < 500) await clickText("Thread");
    await ev("document.querySelector('aside[aria-label=\"Thread\"]').scrollIntoView({ block: 'start' })");
  };

  // replay: autoplay once when the panel is first visible; every message stays in the DOM
  await load(width, "#sample=bakery");
  const total = await ev(msgCount);
  ok(total > 20, `${width}: thread has ${total} messages in the DOM`);
  ok((await ev(hiddenCount)) === 0, "thread starts in its finished state before the panel is visible (no autoplay yet)");
  await showThread(); await sleep(1400);
  const mid = await ev(hiddenCount);
  console.log(`replay autoplay: ${mid} of ${total} messages still hidden after 1.4 s`);
  ok(mid > 0 && mid < total, `autoplay should be part-way (hidden=${mid})`);
  ok((await ev(msgCount)) === total, "all messages stay in the DOM while hidden");
  ok((await ev("document.querySelector('[data-testid=replay-live]').textContent.length")) > 0, "aria-live region got an announcement");
  ok((await ev("document.querySelector('li[data-hidden=\"true\"]').hasAttribute('inert')")) === true, "hidden messages are inert");
  await clickText("Pause"); const p1 = await ev(hiddenCount); await sleep(1500); const p2 = await ev(hiddenCount);
  ok(p1 === p2, `Pause holds still (${p1} -> ${p2})`);
  await clickText("Play"); await sleep(1800);
  ok((await ev(hiddenCount)) < p2, "Play resumes");
  await clickText("Skip to end");
  ok((await ev(hiddenCount)) === 0 && (await ev("document.querySelectorAll('li[inert]').length")) === 0, "Skip to end shows the whole thread");
  await clickText("Restart"); await sleep(700);
  ok((await ev(hiddenCount)) > 0, "Restart hides the thread again and replays");
  // clicking a card finishes the replay and highlights its message
  await ev("document.querySelector('article p.font-display').click()"); await sleep(500);
  ok((await ev(hiddenCount)) === 0, "clicking a card reveals every message");
  ok((await ev("document.querySelectorAll('mark.sweep').length")) >= 1, "clicking a card highlights its message in the thread");
  ok((await ev(apiCalls)) === 0, "replay makes no API calls");

  // reduced motion: finished thread, no autoplay, controls still work
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await load(width, "#sample=bakery");
  await showThread(); await sleep(1800);
  ok((await ev(hiddenCount)) === 0, "reduced motion: finished thread, no autoplay");
  ok((await ev("[...document.querySelectorAll('button')].some((b) => b.textContent.trim().startsWith('Replay'))")) === true, "reduced motion: replay control still offered");
  await send("Emulation.setEmulatedMedia", { features: [] });

  // filters and collapsed groups (all information stays in the DOM)
  await load(width, "#sample=bakery");
  const articles = await ev("document.querySelectorAll('article').length");
  const visibleCards = "[...document.querySelectorAll('article')].filter((a) => a.offsetParent !== null).length";
  const hiddenLists = "[...document.querySelectorAll('[id^=list-]')].filter((l) => l.hidden).map((l) => l.id)";
  ok(JSON.stringify(await ev(hiddenLists)) === JSON.stringify(["list-in_scope", "list-withdrawn"]), `In scope and Withdrawn start collapsed ${JSON.stringify(await ev(hiddenLists))}`);
  ok((await ev(visibleCards)) === articles - 5, `collapsed groups hide only their 3+2 cards (${await ev(visibleCards)} of ${articles})`);
  ok((await ev("[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Show 3 requests')")) === true, "collapsed group shows its count");
  await clickText("Show 3 requests"); ok((await ev(visibleCards)) === articles - 2, "expanding In scope shows its cards");
  await clickText("Hide");
  await ev("[...document.querySelectorAll('[aria-label=\"Filter requests by queue\"] button')].find((b) => b.textContent.includes('Needs change order')).click()"); await sleep(200);
  ok((await ev(visibleCards)) === 3, `filter: Needs change order shows 3 cards (${await ev(visibleCards)})`);
  ok((await ev("document.querySelectorAll('article').length")) === articles, "filtering keeps every card in the DOM");
  await ev("[...document.querySelectorAll('[aria-label=\"Filter requests by queue\"] button')].find((b) => b.textContent.includes('In scope')).click()"); await sleep(200);
  ok((await ev(visibleCards)) === 3 && (await ev("document.getElementById('list-in_scope').hidden")) === false, "filter: In scope shows its (3) cards even though it is collapsed by default");
  await ev("[...document.querySelectorAll('[aria-label=\"Filter requests by queue\"] button')].find((b) => b.textContent.startsWith('All')).click()"); await sleep(200);
  ok((await ev(visibleCards)) === articles - 5, "back to All: collapsed groups collapsed again");
  ok((await ev("document.documentElement.scrollWidth")) <= width, `${width}: no horizontal page scroll (${await ev("document.documentElement.scrollWidth")})`);

  // tabs (375px): Findings and Thread
  if (width < 500) {
    const vis = (sel) => ev(`getComputedStyle(document.querySelector(${JSON.stringify(sel)})).display !== 'none'`);
    await clickText("Findings"); ok((await vis("aside[aria-label=Thread]")) === false, "Findings tab hides the thread");
    await clickText("Thread"); ok((await vis("aside[aria-label=Thread]")) === true, "Thread tab shows the thread");
    await clickText("Findings"); ok((await ev("document.querySelectorAll('article').length")) === articles, "all cards still in the DOM after tab switches");
  }

  // header and footer
  ok((await ev("getComputedStyle(document.querySelector('header')).position")) === "sticky", "header is sticky");
  const links = await ev("[...document.querySelectorAll('header a, footer a')].map((a) => a.getAttribute('href'))");
  ok(links.includes("https://github.com/AnamulAI/ScopeShield") && links.includes("https://www.anamulhoque.com") && links.some((l) => l.endsWith("#readme")), `header/footer links ${JSON.stringify(links)}`);
  ok((await ev("[...document.querySelectorAll('a[target=_blank]')].every((a) => a.rel.includes('noopener'))")) === true, "external links use rel=noopener");
  ok((await ev("document.body.innerText.includes('Powered by Clocked') && document.body.innerText.includes('Built with AI-assisted development (Claude Code)') && document.body.innerText.includes('Sample data is synthetic')")) === true, "credits present");
  ok((await ev(apiCalls)) === 0, "demo session made no API calls");
}
console.log(`\n${checks - failures}/${checks} checks passed`);
ws.close(); chrome.kill();
process.exit(failures ? 1 : 0);
