# For judges

ScopeShield reads a freelancer's contract and a client chat thread, finds each request the client made, and sorts it: in scope, agreed extra, ask me, withdrawn, or needs a change order. It is built on all nine Clocked endpoints.

- **Live demo:** https://scopeshield.anamulhoque.com (fallback: https://scopeshield-1la.pages.dev)
- **60-second video with voice-over:** https://www.youtube.com/watch?v=yEYZu5MoBX8
- **Code:** this repository. Full details are in [README.md](README.md).

## A two-minute walkthrough (no key, no sign-up)

1. Open the live demo. **Demo mode** is already selected. It replays results recorded from live Clocked runs on 7 and 8 November 2026 and makes no API calls. All sample data is synthetic.
2. Click **Pushy client**. The summary shows 6 requests found, 2 that need a change order, and a rough unpaid-hours estimate (labelled as an estimate).
3. Scroll to **Safety and evidence**:
   - **Guard** flagged one client message that tries to instruct the analysis tool, and its text is withheld from the other steps.
   - **Promise check** compares the freelancer's own messages with the contract and shows a possible conflict with both quotes.
   - **Client-supplied scripts** (Inspect) shows a pasted snippet that reads cookies and sends them to an outside domain.
4. In **Needs change order**, click **View change order** on a card. You get the governing clause (Rerank), a drafted message and next step (Fill, marked AI-generated), and a claim check (Verify) before you can copy it.
5. Click **Show request in thread**. The chat panel highlights the client's own sentence. Use **Replay**, **Skip to end** or **Restart** to watch the verdict chips appear.
6. Optional: the **Brand identity** sample has an **Ask me** card, where the app asks one concrete question instead of guessing. **Run live** analyses your own text through the real API (daily caps apply; when they are reached the page offers Demo mode).

## Where each judging criterion is covered

| Criterion | Where to look |
|---|---|
| Usefulness | README, "The problem" and "What it does": scope creep as a string of small asks, for freelancers and small agencies who agree work in chat |
| Clocked integration | README, "How ScopeShield uses Clocked": one table, one row per endpoint, with what it decides and what changes in the app. The app owns the routing thresholds, not the model |
| Additional endpoints | All nine are used: Extract, Decide, Fill (Read); Guard, Protect, Inspect (Protect); Verify, Rerank, Compare (Prove). Each result changes what the user sees |
| Implementation and UX | Uncertain, missing and failed states are shown on purpose (Ask me, "No price was quoted in this thread", visible retries, "Switch to Demo mode" when credits run out). The API key stays server-side in a Cloudflare Pages Function with daily caps. Works on a 375px phone screen |
| Explanation and reproducibility | README "Run it locally", [docs/eval-results.md](docs/eval-results.md), [docs/credit-usage.md](docs/credit-usage.md), [docs/eval-notes.md](docs/eval-notes.md), and a Limitations section |

## Evidence

- **Eval:** 33 golden cases run against the live Clocked API (`npm run eval`, 8 November 2026). **32 pass.** The one failure is real and left failing on purpose (a drafted message opens with "I can certainly", which our rubric forbids). Every case and number is in [docs/eval-results.md](docs/eval-results.md).
- **Credit cost:** measured from `X-Clocked-Credits`. A live analysis-only run of the Fitness sample was 46 credits after Guard, Rerank and Compare were added; one change order adds about 15. See [docs/credit-usage.md](docs/credit-usage.md).
- **Unit tests:** `npm test` (Vitest, all calls mocked).
- **History:** the repository was started on 7 November 2026 for this challenge and its full history is public. No code was copied from earlier projects.

## Reproduce it

```bash
git clone https://github.com/AnamulAI/ScopeShield.git && cd ScopeShield
npm ci
npm run pages:dev     # Demo mode works without a key
```

Live mode needs a Clocked API key in `.dev.vars` (never committed). The README lists every command.

## What to be careful about

- **Demo mode is a replay of recorded runs,** not a live computation. The recorded results are real Clocked outputs from 7 and 8 November 2026.
- **The samples are small and written by us.** The eval says each feature can fire and can stay quiet; it does not say how often it is right on real threads.
- **Hour estimates are rough** and every model judgement is labelled as an estimate.
- **Guard, Protect, Inspect and Verify are detectors, not guarantees.** The README's Limitations section lists what each one can miss.
- The 402 (credits used up) banner and the invented-amount check are unit-tested but were not seen live.

Built with AI-assisted development (Claude Code) by Mohammad Anamul Hoque (AnamDev), https://www.anamulhoque.com.
