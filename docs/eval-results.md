# Eval results

Run on 2026-11-07 against the live Clocked API (`npm run eval`). Cases: `evals/golden.json`. Real numbers only.

**15/15 cases passed.**

| Case | Endpoint | Result | Detail |
|---|---|---|---|
| banner-colour | decide | PASS | outside 0.011, paid 0.004, kind revision |
| ordering-after-think | decide | PASS | outside 0.989, paid 0.002, kind new_feature |
| blog | decide | PASS | outside 0.995, paid 0.003, kind new_feature |
| bengali-agreed | decide | PASS | outside 0.972, paid 0.987, kind new_feature |
| bengali-withdrawn | decide | PASS | outside 0.962, paid 0.003, kind new_feature |
| price-promised-later | decide | PASS | outside 0.986, paid 0.003, kind new_feature |
| whatsapp-ambiguous | decide | PASS | outside 0.554, paid 0.005, kind new_feature |
| banglish-blog | decide | PASS | outside 0.992, paid 0.003, kind new_feature |
| too-expensive | decide | PASS | outside 0.982, paid 0.002, kind new_feature |
| extract-two-requests | extract | PASS | 2 item(s): "change the banner to green", "add a blog section" |
| extract-no-request | extract | PASS | 0 item(s):  |
| fill-anchor-analytics | fill | PASS | price=null; msg="I can certainly add Google Analytics for you; the price for this will be confirmed…" |
| fill-anchor-blog | fill | PASS | price=null; msg="I can certainly add a blog section for your recipes; the price for this change order will …" |
| fill-no-price-quoted | fill | PASS | price=null; msg="I can certainly help you with adding online ordering for cakes; the price for this will be…" |
| fill-price-quoted | fill | PASS | price=$150; msg="I would like to propose a change order to add a Bengali version of the site for an additio…" |

## Credits used by this eval run

| Endpoint | Calls | Credits |
|---|---|---|
| extract | 2 | 6 |
| decide | 9 | 18 |
| fill | 4 | 31 |
| **Total** | 15 | **55** |

## Known weak spots (full pipeline run on `evals/sample-thread.json`, see `docs/credit-usage.md`)

All 15 golden cases pass, but the one end-to-end run exposed issues the golden cases do not cover. Not fixed in M1; no tuning was done after seeing them.

- **Cancellations and confirmations are extracted as requests.** "go ahead with the Bengali version!" and "Actually, forget the Bengali version" were both returned as `client_requests`. The withdrawn Bengali request therefore appears as NEEDS CHANGE ORDER (paid 0.01 because the agreement was withdrawn) even though the client no longer wants it, and the cancellation itself shows up as an "in scope" item. Candidate fixes: tighten the Extract description to exclude cancellations and acknowledgements, and/or merge items that refer to an earlier request.
- **The WhatsApp button routes to IN SCOPE (outside 0.19) inside the full thread**, while the golden case, with the message alone, scores 0.55 (ASK ME). Context changes the verdict; it is borderline either way.
