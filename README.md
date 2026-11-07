# ScopeShield

ScopeShield reads a freelancer's contract and a client chat thread, finds the requests the client made, and tells you which ones are outside the agreement, which the client actually agreed to pay for, and which they later withdrew.

**Live demo:** https://scopeshield-1la.pages.dev (Demo mode needs no key and makes no API calls)

## The problem

Scope creep is rarely one big demand. It is a string of small asks, answered with "sure" or "let me think about it", until nobody agrees on what was promised. "Let me think about it" is not a yes, and a request for a price is not an agreement. Freelancers and small agencies absorb the cost as unpaid work.

## What it does

Paste a contract and a thread, or open one of three synthetic samples. ScopeShield sorts every client request it finds into five queues: needs change order, ask me, agreed extra, in scope, and withdrawn. Each verdict shows the client's own sentence highlighted in the thread, plus the probabilities behind it. For work that needs a change order it drafts a short, polite message and a next step, then checks every claim in that draft against the contract and the thread before you can copy it. A Scope Health summary shows rough unpaid hours, clearly labelled as estimates.

## What is different

The uncertain middle is a feature. When Clocked is not sure, ScopeShield asks you one concrete question instead of guessing, and records your decision. Missing facts stay visible, for example "No price was quoted in this thread".

## Who it is for

Freelancers and small agencies who agree work in chat and email.

## How to try it

Demo mode replays recorded live Clocked results and makes no API calls. Run live analyses your own text. All sample data is synthetic.

## How ScopeShield uses Clocked

ScopeShield uses four Clocked endpoints in one pipeline. Each output changes what the app does or shows.

1. **Extract** (per client message). Finds each separate request the client makes as a verbatim span with character offsets. The offsets drive the evidence highlights in the thread, and an empty result is shown as "no actionable request". It also finds the agreement or withdrawal sentence and, for agreed work, the price quoted for that request ("No price found" when the value is null).

2. **Decide** (per request, on the contract plus the full thread). Questions: is it outside the contract, did the client clearly agree to pay, did the client later withdraw it, what kind of request it is, and how much effort it needs. The application owns the routing. Outside below 0.30 is in scope. Outside at or above 0.70 with agreement to pay at or above 0.75 is an agreed extra; with agreement at or below 0.25 it needs a change order. Anything in the uncertain bands goes to the Ask me queue, where the app asks one concrete question. A withdrawal probability of 0.75 or more moves the request to Withdrawn, which is checked first: the request is excluded from Fill and from the Scope Health numbers, and only its withdrawal sentence is looked up for display. So Decide's probabilities choose the queue, trigger questions to the user and feed the hour estimates.

3. **Fill** (on demand, for change-order items, and for Ask me items you resolve as extra work). One call fills a record: category, unpaid risk, the price quoted, a short message to the client and a next step. Decide's effort and agreement results are passed into Fill's instructions, so a large job with no agreement cannot be rated low risk. Generated text is labelled as an AI-generated draft, and a separate check blocks any currency amount that is not in the contract or thread.

4. **Verify** (after Fill). The generated message is checked claim by claim against two named documents, the contract and the thread. A contradicted claim blocks Copy and shows the evidence. A not-stated claim shows a note and needs one acknowledgement. Supported claims are counted.

**How they work together:** Extract locates, Decide judges, Fill drafts, Verify checks the draft.

**Reliability:** bounded retries with the same Idempotency-Key, per-item retry, partial results kept, concurrency of 3, input caps, an approximate daily cap per IP and overall on live calls, and clear messages for credit, rate-limit and server errors. The API key stays server-side in a Cloudflare Pages Function.

**Evidence:** a live eval of 23 golden cases (22 pass; the one failure is listed openly in [docs/eval-results.md](docs/eval-results.md)), 91 unit tests, and measured credit cost per sample in [docs/credit-usage.md](docs/credit-usage.md).

## What we learned while building it

Extract's list of requests can miss an item in a long thread, so ScopeShield extracts per client message instead. Tightening the description to ignore confirmations and thanks then made it miss plain requests like "Can you change the banner colour?". A full-thread run exposed it; we added a golden case and reworded the field.

Probabilities were more useful than labels. A WhatsApp button request scored about 0.55 on its own but was judged inside the scope in the full thread, because the developer had said there was no extra charge. We updated the expectation instead of tuning the prompt to hit a number, and wrote the case up in [docs/eval-notes.md](docs/eval-notes.md).

Fill needed anchoring. An extract over the whole thread picked the wrong request, so every Fill call is now tied to the one request being drafted. A Fill field then returned "no extra cost" as a price; we clarified the field description and added a golden case, and a separate check blocks any currency amount in generated text that is not in the contract or thread. Decide's single-choice kind tag sometimes disagreed with its outside-contract probability, so the tag is only a label and never the verdict.

Verify is a safety net, not a guarantee. In a probe with deliberately wrong claims it flagged two of three and missed a false statement that the client had approved something. Treat its result as a second pair of eyes and still read the draft before you send it.

Design decision: the application owns the thresholds, not the model. That made the Ask me queue and the withdrawn state easy to explain and test.

## Limitations

- The samples are small and hand-written, so the eval numbers say little about real threads.
- The 402 (credits used up) banner and the invented-amount check are unit-tested but were not seen live. The Verify "contradicted" and "not found" states were checked in the browser only with a hand-made fixture, because none of the recorded drafts triggered them.
- The hour figures are rough estimates from a model score, not quotes.
- One golden case fails and is left failing on purpose: for the WhatsApp "no extra cost" request the drafted message still opens with "I can certainly", which our rubric forbids ([docs/eval-results.md](docs/eval-results.md)).
- Extraction can still miss or mis-split a request; the app only shows what Extract returns. Threads must be one message per line as "Name: text", and the client's name must be typed.
- Verify checks the message only, not the next step. The daily caps on live mode are approximate by design.

*Still to come in the README: an endpoint summary table, screenshots, how to run locally in five commands, and credits for third-party libraries. Built by Mohammad Anamul Hoque (AnamDev) with AI-assisted development (Claude Code).*

## Credits

Fonts: [Fraunces](https://github.com/undercasetype/Fraunces) and [Figtree](https://github.com/erikdkennedy/figtree), both under the SIL Open Font License, self-hosted through the `@fontsource-variable` packages. UI: React, Vite and Tailwind CSS. Powered by the Clocked API. The full list of credits comes with the rest of the README.

## Deploy (Cloudflare Pages)

The app is a static Vite build plus Pages Functions (`functions/api/clocked/[endpoint].ts`, the proxy that holds the API key). You need a Clocked API key and a Cloudflare account.

### Path A: Wrangler direct upload (what the live site uses)

```bash
npm ci && npm run build
npx wrangler login
npx wrangler pages project create scopeshield --production-branch main
npx wrangler kv namespace create RATE_LIMIT      # paste the printed id into wrangler.toml
npx wrangler pages secret put CLOCKED_API_KEY --project-name scopeshield   # paste the key at the prompt
npx wrangler pages deploy dist --project-name scopeshield --branch main
```

Notes:
- If the project name is taken, pick another one and use it in the secret and deploy commands.
- Secrets are read by deployments created after you set them, so run the deploy command again after `secret put`.
- The `RATE_LIMIT` KV binding is required on any non-localhost host: the proxy refuses live requests without it. It enforces 80 Clocked calls per IP and 2,000 per site per UTC day.
- **Counting is approximate by design.** The free KV plan limits writes per day, so the proxy reads the counters on every call but writes only with probability 1/5, adding 5 (for both the per-IP and the site counter). The expected count is right with about a fifth of the writes; individual visitors can overshoot a cap by a few calls, and KV itself is not atomic and reads can be stale for a while, so increments can be lost and the real cap is looser than the nominal one (in a local test with the caps on, the first refusal came after about 155 calls, not 80). If a KV write fails, the proxy refuses the request rather than allowing unlimited use; if a KV read fails, it lets the request through.
- The proxy accepts browser requests from its own host (so the pages.dev domain and any custom domain work without code changes). To allow a separately hosted front end, set the optional `ALLOWED_ORIGINS` env var to a comma-separated list of exact origins.
- Demo mode needs no key and makes no API calls.

### Path B: Git-connected Pages (alternative)

1. In the Cloudflare dashboard: Workers & Pages, Create, Pages, Connect to Git, pick this repository.
2. Build command `npm run build`, output directory `dist`, production branch `main`.
3. Settings, Variables and Secrets: add the secret `CLOCKED_API_KEY`. Settings, Bindings: add a KV namespace binding named `RATE_LIMIT`.
4. Redeploy. Pushes to `main` now deploy automatically.

### Local development

```bash
cp .dev.vars.example .dev.vars    # then put your key in .dev.vars (never commit it)
                                  # optional, local evals only: add ALLOW_UNLIMITED_LOCAL=1 to switch off the daily caps
npm ci
npm run pages:dev                 # http://localhost:8788 (builds, then runs Pages + Functions)
```
