# Credit usage per analysis

Measured from `X-Clocked-Credits` on the recorded demo samples (`npm run snapshot`), last written 2026-11-07. Calls / credits per endpoint.
Each run = Extract per client message + Decide per request + Extract for the agreement/withdrawal sentence of AGREED EXTRA and WITHDRAWN items (under "Extract") + Extract for the quoted price of AGREED EXTRA items ("Price") + Fill per NEEDS CHANGE ORDER and ASK ME item + Verify (grounding) per generated message, i.e. per Fill (Fill and Verify are on demand in the live app; the recording prepares all of them). Verify cost is per draft: see the Verify column divided by its calls.

| Sample | Messages / client messages | Requests | Extract | Decide | Price | Fill | Verify | Total credits |
|---|---|---|---|---|---|---|---|---|
| Bakery website | 36 / 20 | 9 | 23 / 89 | 9 / 25 | 1 / 3 | 3 / 35 | 3 / 15 | **167** |
| Fitness app MVP | 17 / 10 | 4 | 11 / 42 | 4 / 8 | 1 / 3 | 3 / 31 | 3 / 12 | **96** |
| Brand identity | 17 / 10 | 6 | 11 / 46 | 6 / 15 | 1 / 3 | 2 / 24 | 2 / 8 | **96** |

Last partial re-record (`--only verify`) spent 35 credits in total; Extract and Decide results were kept from the earlier full run.

<!-- live-run -->
## One measured live run (7 Nov 2026, `npm run live-run -- fitness-app --fill`)

A fresh live analysis of the Fitness sample through the proxy, with credits read from `X-Clocked-Credits`:

| Step | Calls | Credits |
|---|---|---|
| Read the client messages and look up agreement and withdrawal sentences (Extract) | 11 | 31 |
| Check each request (Decide) | 4 | 6 |
| Agreed price lookup (Extract) | 1 | 2 |
| **Analysis only** | 16 | **39** |
| One change order: Fill | 1 | 13 |
| One change order: Verify | 1 | 4 |
| **Analysis plus one change order** | 18 | **56** |

Credits are not constant. The same thread's analysis-only cost was **39** in this live run and **53** in the recorded run above (42 + 8 + 3), and earlier live runs on the deployed site measured 37 to 39. Fill cost 7 to 13 credits per call and Verify 4 to 6 in the runs we measured. Plan with a range, not a fixed price: a typical 17-message thread costs roughly 40 to 55 credits to analyse, plus about 15 to 20 credits for each change order you prepare (Fill and Verify together).

The recorded totals above are higher than an analysis-only run because the recording prepared a change order (Fill plus Verify) for every Needs-change-order and Ask-me item.
