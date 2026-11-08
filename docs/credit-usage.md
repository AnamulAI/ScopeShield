# Credit usage per analysis

Measured from `X-Clocked-Credits` on the recorded demo samples (`npm run snapshot`), last written 2026-11-08. Cells are calls / credits per endpoint.
Each recording = Guard (1 call over the client's messages) + Extract per client message + Decide per request + Extract for the agreement/withdrawal sentence of AGREED EXTRA and WITHDRAWN items (under "Extract") + Extract for the quoted price of AGREED EXTRA items ("Price") + Rerank per active request ("Rerank") + Compare (1 call over the freelancer's messages) + Fill and Verify for every NEEDS CHANGE ORDER and ASK ME item + one Protect call per evidence pack ("Pack"). Fill, Verify and Pack are on demand in the live app; the recording prepares them all, and for flagged messages also records the "Include anyway" result.

| Sample | Messages / client messages | Requests | Extract | Decide | Price | Fill | Verify | Guard | Rerank | Compare | Pack | Total credits |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Bakery website | 36 / 20 | 9 | 23 / 85 | 9 / 25 | 1 / 3 | 3 / 31 | 3 / 15 | 1 / 2 | 7 / 13 | 1 / 3 | 4 / 20 | **197** |
| Fitness app MVP | 17 / 10 | 4 | 11 / 40 | 4 / 8 | 1 / 3 | 3 / 30 | 3 / 12 | 1 / 2 | 4 / 8 | 1 / 2 | 4 / 16 | **121** |
| Brand identity | 17 / 10 | 6 | 11 / 45 | 6 / 16 | 1 / 3 | 2 / 22 | 2 / 8 | 1 / 2 | 6 / 12 | 1 / 2 | 3 / 13 | **123** |
| Pushy client | 17 / 9 | 5 | 9 / 35 | 6 / 13 | 0 / 0 | 2 / 18 | 2 / 8 | 1 / 6 | 6 / 12 | 1 / 5 | 2 / 8 | **105** |

Last partial re-record (`--only compare`) changed the totals above by 0 credits net; Extract and Decide results of the other parts were kept from earlier runs.

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

## After adding Guard, Rerank, Compare and Protect (8 Nov 2026, same command, current pipeline)

| Step | Calls | Credits |
|---|---|---|
| Read the client messages and look up agreement and withdrawal sentences (Extract) | 11 | 31 |
| Check each request (Decide) | 4 | 6 |
| Agreed price lookup (Extract) | 1 | 2 |
| Guard (one call over the client's messages) | 1 | 1 |
| Governing clause per active request (Rerank) | 4 | 4 |
| Promise check (Compare, one call) | 1 | 2 |
| **Analysis only** | 22 | **46** (was 39 in 16 calls) |
| One change order: Fill plus Verify | 2 | 15 (12 + 3) |
| One privacy-safe evidence pack (Protect) | 1 | 3 |
| **Analysis, one change order and one pack** | 25 | **64** (was 56 in 18 calls) |

Per feature, from the recordings above: Guard about 1 to 2 credits per analysis (6 when it flags a message and returns evidence), Rerank about 2 per request, Compare 2 to 5 per analysis, one Protect call 3 to 5 per pack. In the recorded totals, **analysis-only credits** are Bakery 131 (42 calls), Fitness 63 (22 calls), Brand 80 (26 calls), Pushy client 71 (23 calls); the rest of each total is the change orders and packs the recording prepared.

### Daily cap maths

The proxy counts every Clocked call, whatever the endpoint, against 80 calls per IP and 2,000 per site per UTC day (nominal; counting is sampled and approximate). One analysis-only run now uses 22 to 42 calls on the sample threads, so a visitor gets roughly 2 to 3 analyses a day, or about one full run with every change order and pack. Site-wide that is about 50 to 90 analyses a day.
