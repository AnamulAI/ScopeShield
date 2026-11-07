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
