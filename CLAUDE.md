# ScopeShield — project guide for Claude Code

## What we are building
ScopeShield catches scope creep for freelancers and small agencies. The user pastes (1) the agreed contract/scope and (2) a client chat or email thread. ScopeShield finds every request the client made, decides which ones fall outside the contract, checks whether the client actually agreed to pay extra, and produces a ready-to-send change order and a polite client message.

Built for the Clocked Build Challenge (Rezolve.ai). Deadline: 10 Nov 2026, 11:59 p.m. ET (= 11 Nov 2026, 10:59 a.m. Asia/Dhaka). Official rules: https://clocked.rezolve.ai/build-challenge/rules
Product language is English only (UI, README, demo, copy). Owner: Mohammad Anamul Hoque (AnamDev).

## Core idea (why this wins)
Clocked is strong at: "an approval request is not an approval", "later messages correct earlier ones", and "missing information stays empty". Scope disputes are exactly this problem: "let me think about it" is not consent, "send me the price" is not consent, and consent can be withdrawn. Our UX is built around Decide's probabilities, including an explicit "Ask me" queue for the uncertain middle.

## Hard rules (disqualification risks) — never break these
1. Project must be NEW, started during 21 Oct–10 Nov 2026. Do NOT copy code from any earlier project (including Lcino products). Generic libraries/templates/AI tools are fine; credit third-party work in README.
2. Repository stays PUBLIC with full, honest history until 18 Nov 2026. Small, frequent commits. NEVER force-push, squash, rebase published history, or delete/recreate the repo.
3. NEVER commit secrets. API key lives only in `.dev.vars` (local) and Cloudflare Pages secrets. Never in client bundle, logs, README, tests, screenshots, or commit messages. Run `scripts/check-secrets.sh` before every commit (set it up as a git pre-commit hook in M0).
4. Use only synthetic demo data. No real people, clients, or companies.
5. Every Clocked call must change what the app does or shows. No decorative calls.
6. Do not claim anything in README/UI that the app does not actually do. Honest limits section is required.

## Stack
- Vite + React + TypeScript, Tailwind CSS. Keep dependencies minimal.
- Cloudflare Pages + Pages Functions (TypeScript). Local dev: `wrangler pages dev`.
- No database for v1. (Supabase is optional and only if time remains; do not add it before M5.)
- vitest for unit tests.

## Clocked API — verified facts (from docs and live playground tests on 7 Nov 2026)
- Base URL: `https://clocked.rezolve.ai/clocked/{decide|extract|fill}`, POST, JSON.
- Headers: `Authorization: Bearer <CLOCKED_API_KEY>` and `Idempotency-Key: <uuid>` (new UUID per new request; reuse the SAME key + SAME payload when retrying an unknown outcome).
- Raw HTTP returns the result directly (top-level `answers` for Decide, `fields` for Extract/Fill). The playground wraps results in `data` — do NOT copy that. In M0, write `scripts/smoke.ts` that prints the real raw response of each endpoint and adjust types to what is actually returned.
- Response headers: `X-Clocked-Credits`, `X-Clocked-Cost-Usd`, `X-Clocked-Model-Ms`. Log credits per run in the UI footer.
- Offsets: `start` (inclusive) / `end` (exclusive) count Unicode code points of the ORIGINAL submitted string. In JS use `Array.from(str).slice(start, end).join("")`, never `String.slice`. Never normalize whitespace or line endings before applying offsets.
- Limits: 3.5 MB body, 4 concurrent requests per account (keep ours ≤ 3), client timeout 120 s, Extract text ≤ 200,000 chars, 1–64 fields, list `max_items` 1–32. Errors: 400/422 fix input; 401/403 key; 402 credits; 409 duplicate/in-flight; 429 back off with exponential delay + jitter; 5xx/timeouts retry within a bounded budget using the same Idempotency-Key.
- Docs: https://clocked.rezolve.ai/docs/decide , /docs/extract , /docs/fill , /docs/errors , /docs/limits

### Decide request shape (verified)
```json
{
  "state": "<contract + thread + LATEST REQUEST TO EVALUATE: ...>",
  "instructions": "<shared rules>",
  "questions": {
    "outside_contract": { "type": "noul", "instructions": "...", "threshold": 0.7 },
    "paid_agreement":   { "type": "noul", "instructions": "...", "threshold": 0.75 },
    "kind":   { "type": "choice", "instructions": "...", "criteria": { "revision": "...", "bug_fix": "...", "new_feature": "...", "unclear": "..." } },
    "effort": { "type": "score",  "instructions": "...", "criteria": ["Trivial: minutes", "Small: under one day", "Medium: a few days", "Large: a week or more"] }
  }
}
```
`noul` answers carry `noul` (= probability of YES) and `decision` when a threshold is set. `choice` returns the chosen label; `score` returns a probability-weighted ZERO-BASED expected score. Use exactly these shared instructions (they passed our tests):
"You compare client requests with the agreed contract. A request for a price, 'let me think', 'sounds interesting' or 'send me the quote' is NOT agreement to pay. Agreement counts only if the client clearly accepts a stated price or says to proceed, and it has not been withdrawn later. Count only what is explicitly stated."

### Extract request shape (verified)
`{ "text": "...", "fields": { "name": "description" | { "description": "...", "list": true, "max_items": 8 } } }`. Result: `fields[name].value`, `.start`, `.end`, `.confidence`; list fields also have `.items[]` with their own offsets; missing info = `value: null`.

### Fill request shape (from docs)
`{ "text": "...", "instructions": "...", "fields": { "name": { "type": "extract|choice|multiselect|score|yes_no|generate", ... } } }`. `extract`: description, list, max_items, infer (set `infer:false` for verbatim). `choice`: `options` (2–255). `multiselect`: `options`, `threshold`. `score`: `levels` (lowest→highest). `yes_no`: description. `generate`: description, `format` text|date|number, `max_tokens` 1–400. Generated values are marked `source: "generated"` — never show them as quotations.

## Architecture
- `functions/api/clocked/[endpoint].ts`: thin proxy. Allowlist `decide|extract|fill` only. Adds the secret key, forwards `Idempotency-Key`, rejects bodies > 200 KB, rejects cross-origin browser requests (check `Origin`), passes through status + `X-Clocked-*` headers, never logs bodies or the key. If a KV binding `RATE_LIMIT` exists, enforce a simple per-IP daily cap; otherwise skip.
- The BROWSER orchestrates the pipeline (many small proxy calls, concurrency ≤ 3) so no single Function invocation fans out dozens of subrequests.
- `src/lib/clocked.ts`: typed client (retry/backoff/idempotency), `src/lib/pipeline.ts`: orchestration, `src/lib/routing.ts`: pure decision logic (unit-tested), `src/lib/thread.ts`: thread parsing + offset mapping.

## Pipeline (each step must change app behaviour)
1. Parse thread into messages (`Name: text` lines). User names the client in an input; the app does not guess who is the client.
2. **Extract** per CLIENT message → `client_requests` (list, `infer:false` semantics via description; the description excludes confirmations/acceptances, cancellations, thanks, price/timing questions and developer text) with offsets → map to thread offsets (message start + start, in code points). Output drives the request list and the evidence highlights. Empty list = "no actionable request" shown explicitly.
3. **Decide** per request, state = contract + FULL thread + `LATEST REQUEST TO EVALUATE: <request>` → outside_contract, paid_agreement, withdrawn (noul, threshold 0.75: "Did the client later withdraw, cancel or drop this specific request?"), kind, effort.
4. **Route (app-owned thresholds, in `routing.ts`):**
   - withdrawn ≥ 0.75 → WITHDRAWN (checked FIRST; shown struck through with its evidence; excluded from Scope Health and from Fill)
   - outside < 0.30 → IN SCOPE
   - 0.30 ≤ outside < 0.70 → ASK ME (ambiguous scope)
   - outside ≥ 0.70 and paid ≥ 0.75 → AGREED EXTRA (check it is invoiced)
   - outside ≥ 0.70 and paid ≤ 0.25 → NEEDS CHANGE ORDER (unpaid risk)
   - outside ≥ 0.70 and 0.25 < paid < 0.75 → ASK ME (unclear agreement)
5. **Fill** for NEEDS CHANGE ORDER items (and ASK ME items the user resolves as "extra"): one call. The request text is already known from Extract, so there is NO `request` field in the schema (an extract over the whole thread picked the wrong request in testing). Source text = contract + FULL thread (agreement and price often come in later messages) + a final line `REQUEST TO FILL: <request text>`, and the request text is injected into the descriptions of every field so each is anchored to that one request. Fields: category (choice), unpaid_risk (score Low/Medium/High/Critical), price_mentioned (extract, infer false), change_order_message (generate, ≤ 70 words, max_tokens 120), next_step (generate, ≤ 60 tokens). Instructions: use ONLY this thread; never invent prices, dates, or approvals; polite and non-accusatory; if no price was stated, say the price will be confirmed. Result is a change-order card with a Copy button.
5b. **Decisions and evidence (M3).** ASK ME cards show ONE template-built question (scope-unclear vs agreement-unclear; no model call) with In scope / Extra work / Skip; the answer is stored as "Your decision", can be undone, and moves the item (In scope, or Needs change order). "Extra work" never overrides WITHDRAWN. For AGREED EXTRA and WITHDRAWN items an Extract over the full thread finds the agreement / withdrawal sentence (offsets verified, else "not located"). Fill runs only on demand ("Prepare change order", or "Prepare all", concurrency 3). Invented-amount guard: if generated text contains a currency amount that is not in the contract or thread, Copy is blocked with a visible warning and exactly one strict Regenerate is offered.
5c. **Verify (M7).** After Fill, `POST /clocked/grounding` checks the generated message against two named documents, `contract` and `thread` (the next step is not sent). Contradicted claim: Copy blocked, claim + evidence shown. Not-stated claim: amber note, Copy gated behind one "I've read this" click. Supported claims: counted, evidence highlighted in the thread while the change order is open. Verify failure: "Not verified" + retry, not blocking. The invented-amount guard stays. Recorded for demos with `npm run snapshot -- --only verify`. The proxy allowlist is `decide|extract|fill|grounding`; daily caps always apply unless the dev-only env flag `ALLOW_UNLIMITED_LOCAL=1` is set in `.dev.vars` (never derived from hostname, headers or query string).
6. Scope Health meter: counts per queue + estimated unpaid effort. Map expected effort score → rough hour bands (clearly labelled "rough estimate"); optional user-entered hourly rate. Never present estimates as facts.

## M4 additions (implemented)
- Demo mode is the default: recorded runs of the three synthetic samples (`samples/*.json`, recorded by `npm run snapshot` into `public/demo/*.json` with date and credits), served as static files; the demo client makes NO API calls. "Run live" uses the proxy with input caps.
- Scope Health: counts per queue and a rough unpaid-effort range (bands: <0.5 under 1 h, 0.5-1.5 about 2-6 h, 1.5-2.5 about 16-24 h, >2.5 40 h or more). WITHDRAWN and IN SCOPE never count. Money appears only if the user types an hourly rate.
- Errors: `src/lib/errors.ts` maps every failure class to a specific message; 402 offers "Switch to Demo mode".

## UX principles
- Evidence first: every verdict shows the client's original sentence highlighted in the thread (Extract offsets), plus the probabilities (as bars) behind it.
- Uncertainty is a feature: ASK ME cards ask ONE concrete question ("Did you agree to include the WhatsApp button at no extra cost?") with three buttons: In scope / Extra work / Skip. The override is recorded and shown as "your decision".
- Missing information stays visible ("No price was quoted", "No agreement found").
- Per-item status (pending / running / done / failed) with Retry. Partial results are shown, never discarded. 402 → friendly credits message + switch to Demo mode. 429/5xx → automatic bounded retry, then visible failure.
- Demo mode: bundled synthetic samples with RECORDED real results (`public/demo/*.json`, generated by `npm run snapshot`, labelled "Recorded from a live Clocked run on <date>"), so judges can explore without spending credits. "Run live" uses the proxy with input caps (contract ≤ 6,000 chars, thread ≤ 12,000 chars, ≤ 30 client messages).
- Responsive, accessible, fast. English copy. A calm, professional visual style; no gimmicks.

## Testing and evals
- Unit tests: routing, thread parsing, Unicode offset mapping (include emoji and multi-byte text), retry/backoff.
- `npm run eval`: runs `evals/golden.json` against the live API through the same client and prints a pass/fail table + total credits. Seed it from these cases (Contract: 5-page bakery website, $800; excluded: online ordering, payment integration, blog, hosting management; thread as noted):
  - banner colour change → outside ≤ 0.10
  - online ordering after "Hmm, let me think about it." → outside ≥ 0.90 AND paid ≤ 0.10
  - blog section → outside ≥ 0.90, paid ≤ 0.10
  - Bengali version: "$150… proceed?" → "Sounds good, go ahead!" (no withdrawal) → paid ≥ 0.90
  - same, then "Actually, forget the Bengali version" → paid ≤ 0.10
  - "I will send you a price tomorrow" / "OK please send the price" (analytics + pixel) → outside ≥ 0.90, paid ≤ 0.10
  - "WhatsApp reserve button, small link, no extra cost" → outside between 0.25 and 0.75 (ASK ME zone)
  - Banglish: "bhai ekta blog section add kore dao… koto lagbe bolen" → outside ≥ 0.90, paid ≤ 0.10
  - "Hmm, that sounds a bit expensive, maybe." → paid ≤ 0.10
  Known weak spots from our manual tests: (a) Extract's request LIST can miss a later request in a long thread → that is why we extract per message; (b) Decide `kind` can disagree with `outside_contract` (e.g. PDF button: outside 7.7% but kind=new_feature) → treat `kind` as a tag, never as the verdict.
- Save the eval table to `docs/eval-results.md` for the README (real numbers only).

## Git and commits
- Conventional, descriptive commit messages (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). Commit after every working step; push at least after each milestone.
- First commit must contain `.gitignore` (node_modules, dist, .env*, .dev.vars, .wrangler, coverage), README stub, MIT LICENSE, `.dev.vars.example`.
- Never rewrite history. If a secret is ever committed: stop, tell the user immediately so the key can be rotated in the Clocked account page.

## README (judged: "clear explanation and reproducibility", 10 pts)
Must contain: one-sentence description (what, for whom, which problem); live demo link; short GIF or screenshots; how to run locally in ≤ 5 commands; deploy steps for Cloudflare Pages; a table "Which Clocked endpoint → what it decides → what changes in the app"; how endpoints work together; how the app handles uncertain results, missing information and failed requests; eval results; credit usage per analysis; honest limitations; credits for third-party libraries; note that the app was built with AI-assisted development (Claude Code); built by Mohammad Anamul Hoque (AnamDev).

## Out of scope for v1 (do not build)
Auth/accounts, payments, email sending, real client data, multi-language UI, mobile apps, any database before M5.
