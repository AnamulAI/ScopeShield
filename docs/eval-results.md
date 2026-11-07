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
| extract | 5 | 17 |
| decide | 9 | 14 |
| fill | 7 | 66 |
| verify | 2 | 7 |
| **Total** | 23 | **104** |

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
