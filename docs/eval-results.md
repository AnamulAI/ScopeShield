# Eval results

Run on 2026-11-07 against the live Clocked API (`npm run eval`). Cases: `evals/golden.json`. Real numbers only.

**22/23 cases passed.**

| Case | Endpoint | Result | Detail |
|---|---|---|---|
| banner-colour | decide | PASS | outside 0.011, paid 0.004, withdrawn 0.006, kind revision |
| ordering-after-think | decide | PASS | outside 0.989, paid 0.002, withdrawn 0.035, kind new_feature |
| blog | decide | PASS | outside 0.995, paid 0.003, withdrawn 0.010, kind new_feature |
| bengali-agreed | decide | PASS | outside 0.972, paid 0.987, withdrawn 0.005, kind new_feature |
| bengali-withdrawn | decide | PASS | outside 0.962, paid 0.003, withdrawn 0.995, kind new_feature |
| price-promised-later | decide | PASS | outside 0.986, paid 0.003, withdrawn 0.006, kind new_feature |
| whatsapp-ambiguous | decide | PASS | outside 0.554, paid 0.005, withdrawn 0.007, kind new_feature |
| banglish-blog | decide | PASS | outside 0.992, paid 0.003, withdrawn 0.006, kind new_feature |
| too-expensive | decide | PASS | outside 0.982, paid 0.002, withdrawn 0.097, kind new_feature |
| extract-two-requests | extract | PASS | 2 item(s): "change the banner to green 😀", "add a blog section" |
| extract-no-request | extract | PASS | 0 item(s):  |
| fill-anchor-analytics | fill | PASS | price=null; msg="Adding Google Analytics is outside our current agreement. The price for this will be quote…" |
| fill-anchor-blog | fill | PASS | price=null; msg="Adding a blog section for your recipes is outside our current agreement. I will provide a …" |
| fill-no-price-quoted | fill | PASS | price=null; msg="Adding online ordering for cakes is outside our current agreement. The price for this will…" |
| fill-price-quoted | fill | PASS | price=$150; msg="Adding a Bengali version of the site is outside our current agreement. The price for this …" |
| extract-cancellation | extract | PASS | 0 item(s):  |
| extract-acceptance | extract | PASS | 0 item(s):  |
| extract-polite-question | extract | PASS | 1 item(s): "Can you change the banner colour to dark green?" |
| fill-no-extra-cost-is-not-a-price | fill | FAIL | message says "I can certainly" |
| fill-risk-large-no-agreement | fill | PASS | price=null; msg="Adding online ordering so customers can order cakes is outside our current agreement. The …" |
| fill-risk-critical-ish-no-agreement-medium | fill | PASS | price=null; msg="Adding a blog section for your recipes is outside our current agreement. I will provide a …" |
| verify-flags-wrong-claims | verify | PASS | supported 0, not stated 1, contradicted 1 |
| verify-true-claim-not-contradicted | verify | PASS | supported 1, not stated 0, contradicted 0 |

## Credits used by this eval run

| Endpoint | Calls | Credits |
|---|---|---|
| extract | 5 | 22 |
| decide | 9 | 19 |
| fill | 7 | 73 |
| verify | 2 | 6 |
| **Total** | 23 | **120** |

## Notes and history (hand-written; appended to every eval run)

- **M1 → M1.5.** The first full pipeline run extracted a cancellation ("Actually, forget the Bengali version") and an acceptance ("go ahead") as requests. We tightened the Extract description and added a `withdrawn` Decide question plus a WITHDRAWN route. Re-run: both messages now yield no item, and the Bengali request is WITHDRAWN (withdrawn 0.995 in the golden case).
- **Regression found and fixed on the way.** The first tightened wording ("each separate NEW thing... as a short noun phrase") made Extract return nothing for plain change requests such as "Can you change the banner colour to dark green?". We added the golden case `extract-polite-question`, then reworded the description (changes to existing work count; polite questions count; return a phrase copied verbatim). Side effect: highlighted evidence now often includes the whole "Can you ...?" sentence rather than a bare noun phrase. This was a fix for a failing real case, not tuning to hit a number.
- **WhatsApp case.** The developer says "no extra cost", and inside a full thread the model scores it as in scope (outside about 0.1-0.2); alone it scores 0.55. The golden expectation is now `outside <= 0.75` rather than the ASK ME band. Real ASK ME examples will come from curated sample threads in M4, recorded from live runs.
- Credits vary a little per run (longer state costs more); the tables show the real counts of each run.
- **"no extra cost" is not a price (M3).** In the first live UI run, Fill returned `price_mentioned = "no extra cost"` for the WhatsApp request. We found it by looking at the change-order card, not through the golden set, so we added the golden case `fill-no-extra-cost-is-not-a-price` and clarified the field description (a price is an amount with a currency; "free", "no extra cost" and "how much?" are not). The case passes after the change. The other three Fill checks (message anchored to its own request, null when no price quoted, no invented amounts) were unaffected.

## M4: recorded sample threads (7 Nov 2026), kept exactly as they came back

The three synthetic threads in `samples/` were written first and run once live (`npm run snapshot`); none was edited afterwards. Outcomes are in `public/demo/*.json`.

- **Bakery (36 messages, 20 from the client, 9 requests, 141 credits):** banner colour IN SCOPE; online ordering, blog and analytics NEEDS CHANGE ORDER; Bengali WITHDRAWN; Instagram feed AGREED EXTRA; WhatsApp button IN SCOPE (0.07, the developer said "no extra cost"). The corrected request worked better than planned: "prices in a table" came back WITHDRAWN and its replacement "simple list" IN SCOPE.
- **Fitness app (17 messages, 4 requests, 76 credits):** push notifications, dark mode and the Instagram-share "quick question" all NEEDS CHANGE ORDER; the admin dashboard AGREED EXTRA ($900 approved in writing).
- **Brand studio (17 messages, 6 requests, 82 credits):** darker clay, bolder font and hex codes IN SCOPE; social templates NEEDS CHANGE ORDER; business cards AGREED EXTRA ($350); the third revision round came back ASK ME (outside 0.61).

Traps that did NOT behave as planned:
- **Dark mode was meant to be ambiguous but routed NEEDS CHANGE ORDER (outside 0.98).** Our own contract says "anything not on the feature list is out of scope", so the model is arguably right and the trap was badly designed. We did not edit the thread. The brand thread's third revision round supplies a real ASK ME example instead, so we did not add a fourth thread.
- **The third revision round was meant to be a clear change order but routed ASK ME (0.61).** The developer states both included rounds were used up, yet the request is a small tweak ("a little more rounded"). Plausibly a fair question for the human.
- **Push notifications scored withdrawn 0.56** after "lol not now, lets focus on launch". It stayed below the 0.75 threshold, so it remains NEEDS CHANGE ORDER. "Not now" is not a withdrawal, which seems right.
- **WhatsApp stayed IN SCOPE** again (see M1.5 note): the model treats "no extra cost" from the developer as in scope.

## M5.5: Fill quality pass (7 Nov 2026)

Triggered by reviewing a real screenshot: a change order for a large request (online ordering) showed `unpaid_risk: Low`, the generated message said "I can certainly add…", and the next step was the vague "the price will be confirmed".

What changed and why:
- **Decide results now reach Fill.** The shared instructions end with "Effort estimate from Decide: <level>. Agreement to pay found: <yes/no>." and `unpaid_risk` has an explicit rubric (Low = trivial effort or an agreement exists; Medium = under about a day, no agreement; High = several days; Critical = a week or more; never Low for Large effort with no agreement). Golden cases `fill-risk-large-no-agreement` (effort 3, no agreement) and a second no-agreement case check the risk is not Low. Re-recorded online ordering now comes back Critical.
- **Message rubric:** at most 70 words, first person, say the request is outside the agreement, say the price is quoted separately (a price only if it is in the thread), ask the client to confirm first, no delivery dates, no implying free work. `max_tokens` is now 120 (was 200). Every Fill golden case now also checks word count, "outside the agreement", an ask to confirm, no delivery-date phrasing, no "I can certainly" and no invented amounts.
- **Next step rubric:** one imperative sentence to the freelancer ("Send <client> a quote for "<request>" and wait for a written yes before starting."). The first version printed the request unquoted and read badly ("a quote for add Google Analytics"), so the template now quotes it. Checks reject third person and "will be confirmed".
- **Agreed price:** AGREED EXTRA cards now run an Extract over the full thread with the request injected ("the price the developer quoted for THIS request"). Only the extracted text is shown ($120, $900 and $350 in the recordings); null shows "No price found in the thread".
- Cards: change order collapsed behind "View change order"; the kind tag is hidden for in-scope and withdrawn items; queue order is Needs change order, Ask me, Agreed extra, In scope, Withdrawn.

Eval result after the change: **20/21 golden cases pass.** The one failure is real and not hidden: for the WhatsApp request ("no extra cost") the message still opens with "I can certainly add a small WhatsApp reserve button for you", which the rubric forbids. We did not edit the output.

One of our own checks was too strict: the first run flagged six messages for "not asking to confirm" because the regex looked for the word "confirm", while the messages said "please let me know if you would like to proceed before any work starts". That is a valid ask, so the check was widened (confirm / let me know / proceed / go ahead / approve / before work starts). This was a fix to the test, and the 6 messages themselves were not changed.

Re-recording used `npm run snapshot -- --only fill,price` (Extract and Decide results kept; Fill and price results replaced). It cost 99 credits (bakery 38, fitness 34, brand 27). Observed in the new recordings: all 8 change orders say the request is outside the agreement and ask for a go-ahead; next steps are imperative; the 70-word limit holds. Remaining roughness: next steps quote the request verbatim including its trailing "?", and some messages offer to "provide a quote", which reads slightly odd for a freelancer who is the one quoting.

## M7: Verify (`/grounding`) on generated change-order messages (7 Nov 2026)

Request and response shapes were read from the docs and confirmed with real calls: `POST /clocked/grounding` with `documents: [{id, text}]`, `answer`, optional `instructions`, `evidence: "all"`; the raw response has top-level `grounded`, `verdict` and `claims[]` (each with `claim`, `kind`, `verdict` of supported / contradicted / not_stated / not_a_claim, three probabilities, `source`, optional `evidence {document, quote, start, end}`; offsets are local to the named document). No `data` wrapper.

What the app does with it: after Fill, the generated **message** is checked against two named sources, `contract` and `thread`. The **next step is not sent**: a real test showed Verify splitting the quoted request in the next step into meaningless fragments ("not a claim"), and a next step is an instruction to the freelancer, not a statement about the documents. The invented-amount guard stays; Verify is an extra layer.

Policy (decided after seeing real outputs):
- **Contradicted** claim: Copy is blocked for that draft; the claim and the passage that contradicts it are shown, with "Show in thread" when the passage is in the thread. Acknowledging does not unblock it.
- **Not stated** claim: amber "Not found in the thread" note with the claim; not blocking (a promise such as "the price will be quoted separately" is not a fact), but Copy is gated behind one click on "I've read this".
- **Supported** claims: counted ("N claims checked against the contract and thread"), evidence in a collapsed list. Evidence passages that fall in the thread are highlighted while that change order is open.
- Verify unavailable: the draft is labelled "Not verified" with a retry; Copy is not blocked by Verify (the amount guard still applies).
- We added one instruction sentence: offers, requests and promises by the freelancer are not factual claims about the documents. Even before that wording, the first real call judged "The price for this will be quoted separately" as supported (from the developer's "I can send you a quote").

Real outcomes on the 8 recorded change orders (`npm run snapshot -- --only verify`, 35 credits, about 4 to 6 per draft): **every claim was supported** (1 to 2 claims per draft; offers and questions were classified as not-a-claim). 0 not stated, 0 contradicted. So normal drafts produce no false alarms, and we kept the stricter display policy above.

Golden checks (2 new, 7 credits): a test-only string with deliberately wrong claims ("Online ordering is included in the agreed contract. You agreed to pay $500 for it.") is flagged (1 contradicted, 1 not stated), and a true claim is not contradicted. **A miss we saw while probing:** in a separate probe, the false claim "Nila approved it in the thread" was judged *supported* (0.73), although Nila only said "let me think about it". Verify can be wrong; this is why the UI says it checks support in the sources and why the draft still needs a human read.

Eval after M7: **22/23** golden cases pass; the remaining failure is the known WhatsApp "I can certainly" case from M5.5.

Other things found while doing M7:
- The local `wrangler pages dev` server picked up the KV binding from `wrangler.toml` and our own daily cap blocked the eval after about 80 local calls. The proxy now skips the caps on localhost (a deployed host is never localhost); tests cover both sides.
- The secret-scan hook was re-checked: `CLOCKED_API_KEY=` followed by a 32-character value and `Authorization: Bearer` followed by a long token were both blocked, and a harmless line containing `risk-large-no-agreement` passed. That harmless control file was accidentally committed (and removed in the next commit); the fake-key files were blocked and never entered history.

## Security change after M7: no hostname-based cap skip

The M7 fix that skipped the daily caps on `localhost` was replaced by an explicit environment flag, `ALLOW_UNLIMITED_LOCAL=1`, read only from the server environment (`.dev.vars` locally; never set on the deployed project). The proxy ignores anything a caller controls: hostname, `Host`/`X-Forwarded-Host`, headers and query strings. Tests cover: flag off means caps are enforced even on localhost, a missing KV binding is refused even on localhost, only the exact string "1" enables the flag, and sneaky headers/query strings do nothing. Local check with no flag: 160 requests with `?ALLOW_UNLIMITED_LOCAL=1` and an `x-allow-unlimited-local` header got 153 upstream answers and then 429 `limit_reached`. The first 429 came after about 155 calls rather than 80: KV reads can be stale, so sampled increments are sometimes lost and the cap is looser than nominal. The README says so.
