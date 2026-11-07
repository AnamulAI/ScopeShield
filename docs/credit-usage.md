# Credit usage per analysis

Measured on 2026-11-07 from `X-Clocked-Credits` while recording the three demo samples (`npm run snapshot`). Calls / credits per endpoint.
Each run = Extract per client message + Decide per request + Extract for the agreement/withdrawal sentence of AGREED EXTRA and WITHDRAWN items (counted under Extract) + Fill per NEEDS CHANGE ORDER and ASK ME item (Fill is on demand in the live app; the recording prepares all of them).

| Sample | Messages / client messages | Requests | Extract (calls / credits) | Decide | Fill | Total credits |
|---|---|---|---|---|---|---|
| Bakery website | 36 / 20 | 9 | 23 / 89 | 9 / 25 | 3 / 27 | **141** |
| Fitness app MVP | 17 / 10 | 4 | 11 / 42 | 4 / 8 | 3 / 26 | **76** |
| Brand identity | 17 / 10 | 6 | 11 / 46 | 6 / 15 | 2 / 21 | **82** |
