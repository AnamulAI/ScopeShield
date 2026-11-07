# Credit usage for one full analysis

Measured on 2026-11-07 from `X-Clocked-Credits`, on `evals/sample-thread.json` (17 messages, 10 from the client, 5 requests found). Fill is not part of the base pipeline; it runs only for change-order items.

| Endpoint | Calls | Credits |
|---|---|---|
| extract | 10 | 36 |
| decide | 5 | 11 |
| **Total** | 15 | **47** |

Average: 3.6 credits per client message (extract) + 2.2 per request (decide).

## Result of this run

| Msg | Request | Evidence | outside / paid | Queue |
|---|---|---|---|---|
| 1 | Can you change the banner colour to dark green? | ok | 0.01 / 0.01 | in_scope |
| 3 | add online ordering so customers can order cakes | ok | 0.99 / 0.00 | needs_change_order |
| 6 | add a small WhatsApp reserve button, just a link, no extra cost | ok | 0.07 / 0.00 | in_scope |
| 7 | add a Bengali version of the site | ok | 0.97 / 0.00 | withdrawn |
| 12 | Can you add a blog section for our recipes? | ok | 0.99 / 0.00 | needs_change_order |
