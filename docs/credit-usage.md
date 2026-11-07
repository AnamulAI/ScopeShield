# Credit usage for one full analysis

Measured on 2026-11-07 from `X-Clocked-Credits`, on `evals/sample-thread.json` (16 messages, 9 from the client, 6 requests found). Fill is not part of the base pipeline; it runs only for change-order items.

| Endpoint | Calls | Credits |
|---|---|---|
| extract | 9 | 34 |
| decide | 6 | 12 |
| **Total** | 15 | **46** |

Average: 3.8 credits per client message (extract) + 2.0 per request (decide).

## Result of this run

| Msg | Request | Evidence | outside / paid | Queue |
|---|---|---|---|---|
| 1 | change the banner colour to dark green | ok | 0.01 / 0.00 | in_scope |
| 3 | add online ordering so customers can order cakes | ok | 0.99 / 0.00 | needs_change_order |
| 6 | add a small WhatsApp reserve button, just a link, no extra cost | ok | 0.19 / 0.00 | in_scope |
| 8 | go ahead with the Bengali version! | ok | 0.91 / 0.01 | needs_change_order |
| 10 | Actually, forget the Bengali version. Not needed. | ok | 0.12 / 0.01 | in_scope |
| 11 | add a blog section for our recipes | ok | 0.99 / 0.00 | needs_change_order |
