# Design notes: palette

ScopeShield uses one palette: warm paper surfaces, ink-navy text and structure, and one restrained accent per queue.
Everything below lives in `src/index.css` (`@theme`). Components use tokens only; there are no hard-coded colours in `src/**/*.tsx`.

## Rules

1. **Surfaces are warm** (paper, paper-deep, card, sand, line). **Text and structure are the ink-navy family** (ink, navy, muted).
2. **One accent per queue**, used only for that queue: icons, pills, chips, tiles, headings, bars, the hero animation and the chat verdict chips all read the same five tokens (`QUEUES` in `src/components/queues.ts`).
3. **Info and banner surfaces are neutral**: `paper-deep` fill with a `line` hairline. Queue tints are never used for generic notices (so "blue" always means Agreed extra). The recorded-run notice, the "Recorded thread" badge and the "AI-generated draft" label are neutral for that reason.
4. **Status tints** use the same logic everywhere: full `*-bg` fill + 30% hairline of the matching colour (no translucent fills). `warn` (amber) is for "not found in the thread". Errors and blocked copy reuse the rust `change` colour on purpose: both mean "money or action at risk". This is the one deliberate overlap.
5. **Shadows are warm-tinted**: every shadow is built from `--color-shadow` (ink mixed with the warn brown), never from pure navy or black.
6. **The chat window stays distinct through depth, shape, structure and the sans font, not through a different hue**: a deeper sand canvas with a faint warm dot pattern, cream header and composer bar, cream client bubbles with a hairline, ink-navy bubbles for everyone else.

## Tokens

| Token | Hex | Where it is used |
|---|---|---|
| `--color-paper` | `#f5f0e6` | page background, composer bar, quiet pills, text on navy |
| `--color-paper-deep` | `#ece5d6` | skeletons, progress tracks, info banners, neutral badges, hover fills |
| `--color-card` | `#fffdf8` | cards, chat header and footer, client bubbles, inputs |
| `--color-line` | `#e4dccb` | hairline borders everywhere, hero ghost lines |
| `--color-ink` | `#1a2133` | body text, client bubble text |
| `--color-navy` | `#1b2a41` | logo, primary buttons, Scope Health panel, other speakers' bubbles, focus ring |
| `--color-muted` | `#4a5266` | secondary text, name labels, captions, typing dots |
| `--color-change` / `-bg` | `#a23f0b` / `#fbe8db` | Needs change order everywhere; also errors and blocked copy (see rule 4) |
| `--color-ask` / `-bg` | `#5a3fa5` / `#eee9f9` | Ask me everywhere (question card, hint banner) |
| `--color-agreed` / `-bg` | `#17607c` / `#dcedf4` | Agreed extra everywhere (agreement and price blocks) |
| `--color-scope` / `-bg` | `#25664a` / `#e0f0e6` | In scope; "supported" Verify check |
| `--color-withdrawn` / `-bg` | `#5b5e66` / `#ebeae7` | Withdrawn; Later-withdrawn bar |
| `--color-warn` / `-bg` | `#7a4b00` / `#fdf3d9` | "Not found in the thread" note; also the base of the shadow tint |
| `--color-pending-bg` | `#efe6c8` | highlight while a request is still being checked |
| `--color-sand` (derived) | `#e6dfce` | chat canvas = 72% line + 28% paper-deep |
| `--color-stone` (derived) | `#b6b3ad` | neutral strokes (hero message lines) = 70% line + 30% muted |
| `--color-shadow` (derived) | `#372e24` | shadow and dot-pattern base = 70% ink + 30% warn |

Avatar fills (cream initials) are token references too, assigned by order of first appearance in the thread: `agreed`, `change`, `ask`, `scope`, `navy`, `withdrawn`. They carry no queue meaning there; they only tell participants apart.

## What the audit changed

- Chat window: removed seven cool blue-greys (`#f6f8fb`, `#e8edf3`, `#d5dde8`, `#dde3ea`, `#eef2f7`, `#3f4859`, `#5d6a7e`) and pure white; the window now uses card, sand, line, paper, muted and navy.
- Shadows: `rgb(26 33 51 / …)` (cool navy) replaced by warm-tinted `--color-shadow` mixes, including the inset input shadow and the chat bubble hairline shadow.
- Gradients and overlays: the page's radial gradients, text selection and focus-ring offset now use `color-mix` of tokens instead of literal rgb values.
- `text-white` (6 places) became `text-card`; the logo SVG used a slightly different paper (`#f4efe4`) and now reads the tokens.
- Hero SVG: ghost lines use `--color-line`, moving neutral lines use `--color-stone`.
- Banners: the recorded-run notice (was Agreed-extra blue), the "Recorded thread" badge (was blue) and the "AI-generated draft" label and draft boxes (were Ask-me purple) are now neutral, so queue colours only ever mean their queue. Translucent tints (`/50`, `/60`, `/70`, `/80`) on status fills became full `*-bg` fills; status hairlines are all 30%.
- New slim chat scrollbar (`scrollbar-width: thin` + `scrollbar-color`, with a WebKit fallback): faint at rest, stronger on hover and focus.

## Justified exceptions

- `public/favicon.svg` and `scripts/og.html` (source of `public/og.png`) contain literal hex values because a favicon and a social image cannot read CSS variables. They use the same token values (the og text neutral was updated to `#4a5266`).
- Probability bars use `navy` (outside contract), `agreed` (agreed to pay) and `withdrawn` (later withdrawn) as data colours, not as queue labels; they carry no queue meaning.

## Contrast (WCAG AA, 4.5:1 for text)

Lowest ratio found: **5.39:1** (Withdrawn chip, `#5b5e66` on `#ebeae7`). Others: Needs change order chip 5.43, In scope chip 5.78, Agreed extra chip 5.82, name labels on the sand canvas 5.88, muted on paper-deep 6.23, avatar initials 6.35 or more, client bubble text 15.8, text on the navy bubbles 12.7 (paper on navy), muted captions 6.9 on paper and 7.7 on card, primary replay button 12.7, secondary replay button 14.2.

## Safety and evidence area (M9 to M12)

One calm card ("Safety and evidence") between the summary and the findings, with three rows: Guard, Promise check and the privacy-safe evidence pack (collapsed by default). It adds **no new tokens, hues or fonts**.

- **Amber (`warn` / `warn-bg`) means "this needs your review"**, never a verdict: the Guard banner and chip, each "Possible conflict, please review" item, the "Detection can miss sensitive data" note, and the marks for flagged and conflicting passages in the chat (dashed, like the other secondary evidence marks). `warn` on `warn-bg` is 6.7:1.
- Rows are `card` with `line` hairlines; inner items use `paper` fills. The governing clause on a card is plain text with a section icon in `navy`; the clause score is small `muted` text.
- Icons added to the same family (24-grid, 1.75 stroke): shield with exclamation (Guard flagged), two opposing arrows (conflict), page with a fold (evidence pack), section sign (governing clause).
- The Pushy client sample is the fourth chip in the sample row; nothing else in the layout moved. The new area keeps final values in the DOM and adds no animation beyond the existing `press` hover and the `<details>` chevron.

## Client-supplied script row (M13)

Inspect adds one row to a request card, only when the client pasted a code snippet, and one row ("Client-supplied scripts") to the Safety and evidence area. It adds **no new tokens, hues, fonts or animation**.

- The risk chip uses existing tokens: routine = `muted` on `paper-deep`, suspicious = amber (`warn` / `warn-bg`, the same "needs your review" meaning as Guard and Compare) and harmful = the existing `change` / `change-bg` pair used for "Needs change order". It is a model estimate, never a verdict.
- Evidence lines sit in a small `<pre>` on `paper-deep` with the mono stack already in use, wrapped (no horizontal page scroll at 375 px). "Show in thread" scrolls to the snippet; the snippet is marked in the chat like other evidence.
- The caveat "A benign result is not a safety guarantee. Read the code yourself." is always visible under the row. A failed check shows "Not checked" with Retry.
- New icon in the same family (24-grid, 1.75 stroke): angle brackets (code).
