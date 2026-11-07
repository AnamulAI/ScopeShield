# ScopeShield — build plan (times are Asia/Dhaka)

Hard deadline: Wed 11 Nov 2026, 10:59 a.m. (= 10 Nov, 11:59 p.m. ET). Plan to be DONE by Tue 10 Nov, 6 p.m. Submit a complete draft in the entry form by Mon 9 Nov night (the form is editable until the deadline; the latest saved version is judged).

Read CLAUDE.md first. Work milestone by milestone. At the end of each milestone: run tests, run `scripts/check-secrets.sh`, commit, push, then tell the user in 3–5 lines what works and what is next. Do not start the next milestone before the acceptance criteria pass.

## M0 — Foundation (Sat 7 Nov, ~1 h)
- Clone https://github.com/AnamulAI/ScopeShield.git (currently EMPTY). First commit: `.gitignore`, README stub, MIT LICENSE, `.dev.vars.example` (`CLOCKED_API_KEY=`), `scripts/check-secrets.sh` + pre-commit hook.
- Scaffold Vite + React + TS + Tailwind; vitest; `wrangler pages dev` script.
- `functions/api/clocked/[endpoint].ts` proxy as specified in CLAUDE.md.
- `scripts/smoke.ts`: one tiny call each to decide, extract, fill via the proxy; print RAW responses and the `X-Clocked-*` headers. Fix the TypeScript types to match reality (raw HTTP has no `data` wrapper).
- The user will put the key in `.dev.vars`. Never ask for it in chat, never print it.
Accept: smoke script passes; `git log` shows an honest first commit; key not in git.

## M1 — Engine (Sat 7 Nov evening)
- `thread.ts` (parse, client detection by the user-supplied name, Unicode-safe offset mapping), `routing.ts` (pure, unit-tested), `clocked.ts` (retry/backoff/idempotency/concurrency 3), `pipeline.ts` (extract per client message → decide per request → route).
- `evals/golden.json` + `npm run eval` (see CLAUDE.md). Run it once live; save `docs/eval-results.md`.
Accept: all golden cases pass or failures are explained honestly in the eval file; unit tests green.

## M2 — UI v1 (Sun 8 Nov morning)
- Input screen: contract box, thread box, client-name field, "Load sample" buttons, Analyze.
- Results: three queues (Needs change order / Ask me / In scope) + Agreed extra; thread view with highlighted evidence; probability bars; per-item status and retry.
Accept: sample thread analysed end-to-end live, evidence highlights land on the correct sentences.

## M3 — Fill + decisions (Sun 8 Nov afternoon)
- Fill call for change-order items → change-order card (request, category, unpaid risk, price mentioned or "none quoted", generated client message, next step) with Copy. Mark generated text visibly as AI-generated draft.
- ASK ME flow: one concrete question + In scope / Extra work / Skip; override recorded and shown; "Extra work" triggers Fill.
Accept: change-order message never invents a price or approval (add a unit/eval check that scans for `$` amounts not present in the thread).

## M4 — Scope Health, errors, Demo mode (Sun 8 Nov evening)
- Scope Health meter + rough unpaid-effort estimate (labelled as estimate; optional hourly rate input).
- Error states for 400/402/409/429/5xx/timeouts; partial results kept.
- Three synthetic sample threads (bakery website; mobile-app freelancer; branding agency), 25–40 messages each for the main one, with hidden extras and these traps: soft "yes" ("let me think"), approval later withdrawn, price asked but never quoted, genuine agreement, in-scope revision, ambiguous small add-on, a corrected earlier request. `npm run snapshot` records real results into `public/demo/*.json`; Demo mode loads them instantly with a visible "Recorded from a live Clocked run on <date>" label.
Accept: a stranger can understand the app in 30 seconds without spending credits.

## M5 — Deploy + polish (Mon 9 Nov morning)
- Cloudflare Pages project connected to the GitHub repo; secret `CLOCKED_API_KEY` set in Pages settings; optional KV `RATE_LIMIT`. Verify the deployed app works live AND in Demo mode. Keep the deployment and repo alive until 18 Nov 2026.
- Responsive pass (phone width), empty states, accessibility basics, favicon, page title, social preview image.
Accept: public URL works for an anonymous visitor; no secret in the client bundle (grep the build output).

## M6 — README + demo assets (Mon 9 Nov afternoon)
- README per CLAUDE.md. Include the endpoint table, the uncertainty/failure handling section, eval table, credit cost per analysis (measure from `X-Clocked-Credits`), limitations.
- Short screen recording or GIF of: paste thread → Analyze → evidence highlight → Ask-me card → change order → Scope Health. (The user will record the final video; prepare a shot list in `docs/demo-script.md` with a 10-second hook.)
Accept: someone can clone, add a key, and run locally in ≤ 5 commands.

## M7 — Optional, ONLY if M0–M6 are fully done (Mon 9 Nov evening)
Pick at most two, each must change what the app does:
- Guard (`/injection`): client messages are untrusted input; if a message tries to instruct the analysis ("ignore previous instructions…"), flag it, exclude it from the Decide state, and show the evidence.
- Verify (`/grounding`): check every claim in the generated change-order message against the thread; block "Copy" and show the unsupported claim if verification fails.
If added, extend README table and evals. Do not add anything that is not wired into app behaviour.

## M8 — Freeze (Tue 10 Nov)
- Code freeze by 2 p.m. Final eval run, final secret scan (`git log -p | grep` for key-like strings), final deploy check, update README timestamps.
- Hand over to the user for form submission and the LinkedIn post. Do not push after the user has submitted unless they ask; any later push must be intentional and tested.
