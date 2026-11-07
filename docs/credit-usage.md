# Credit usage per analysis

Measured from `X-Clocked-Credits` on the recorded demo samples (`npm run snapshot`), last written 2026-11-07. Calls / credits per endpoint.
Each run = Extract per client message + Decide per request + Extract for the agreement/withdrawal sentence of AGREED EXTRA and WITHDRAWN items (under "Extract") + Extract for the quoted price of AGREED EXTRA items ("Price") + Fill per NEEDS CHANGE ORDER and ASK ME item (Fill is on demand in the live app; the recording prepares all of them).

| Sample | Messages / client messages | Requests | Extract | Decide | Price | Fill | Total credits |
|---|---|---|---|---|---|---|---|
| Bakery website | 36 / 20 | 9 | 23 / 89 | 9 / 25 | 1 / 3 | 3 / 35 | **152** |
| Fitness app MVP | 17 / 10 | 4 | 11 / 42 | 4 / 8 | 1 / 3 | 3 / 31 | **84** |
| Brand identity | 17 / 10 | 6 | 11 / 46 | 6 / 15 | 1 / 3 | 2 / 24 | **88** |

Last partial re-record (`--only fill,price`) spent 99 credits in total; Extract and Decide results were kept from the earlier full run.
