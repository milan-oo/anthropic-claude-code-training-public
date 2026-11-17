# SPEC · NWP-101 — Payments export: let ops choose columns and scope

> Written before any code. Generated with `/spec`, then edited by a human.
> Load it as context when you build: `@docs/specs/NWP-101-export-options.md`

**Ticket:** [NWP-101](../tickets/NWP-101.md)
**Author:** Claude (`/spec`), for review
**Status:** done (built and verified locally; not yet reviewed)

## Problem

Ops exports the payments table several times a day for merchant queries, month-end reconciliation and Finance requests. Every file carries every column, including card last-four, so anything sent to a merchant is cleaned up by hand: 3–4 hours a month, and one near-miss last quarter when an unedited file nearly went to the wrong merchant.

## Current state

All paths are under `build-battle/merchant-console/`.

- `src/app/payments/page.tsx:68–76` — Export is a plain link to `/api/payments/export?{current query}`. No options and no count.
- `src/app/api/payments/export/route.ts:11–24` — parses filters with `parseFilters`, runs `filterPayments` and `sortPayments` over the whole store (no `paginate`), writes `toCsv(rows)` with every column and names the file with `exportFilename()`. The export is already server-side and already covers every matching row, so the ticket's pagination warning does not apply to today's code. It would apply to a browser-side rewrite.
- `src/data/queries.ts:18–36` — `parseFilters` is the server allowlist for status, sort and direction. `merchantId` and `search` pass through unchecked; they are only compared, never interpolated.
- `src/data/queries.ts:102` and `src/app/api/payments/route.ts:4–7` — `GET /api/payments` returns `{ rows, total, page, pageCount, pageSize }`. `total` is the full filtered count, which is the "row count before download" the ticket asks for.
- `src/lib/csv.ts:13–26` — `EXPORT_COLUMNS` (10 columns, including `last4`) and the `ExportColumn` type.
- `src/lib/csv.ts:58–67` — `toCsv(payments, columns = EXPORT_COLUMNS)` already writes only the requested columns, in the given order. No production caller passes `columns`.
- `src/lib/csv.ts:51–54` — the `amount` cell is `formatMoney(minor, currency)`, formatted once on the way out, with `currency` in its own column. This criterion is already met. `src/lib/csv.test.ts:32–41` pins this format, and the file header says those tests "should still pass afterwards".
- `src/lib/csv.ts:69–71` — `exportFilename(date)` returns `payments-YYYY-MM-DD.csv`, with no scope.
- `src/components/` has no Dialog. `src/components/Drawer.tsx` is a Tremor wrapper over `@radix-ui/react-dialog` (`role="dialog"`, focus trap, Escape closes, focus returns to the trigger) with Header, Title, Description, Body and Footer parts. Nothing uses it yet. There is no Checkbox or RadioGroup component.
- **Ticket vs code:** the ticket says to add "an options dialog". `.claude/rules/components.md` used to list a Dialog that does not exist. The Drawer is that dialog.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| "Column names arrive from the client, so **validate them server-side**." | NWP-101 notes | A crafted URL puts `last4` or junk into a merchant file |
| "Anything from the client — column names, currencies, limits, statuses — is checked against an allowlist before it reaches a query, a filename, or the store." | `merchant-console/CLAUDE.md` | Unvalidated status text in a filename |
| "Payment filtering goes through the builder behind `GET /api/payments`. A second implementation is a bug." | `merchant-console/CLAUDE.md` | Count and file disagree |
| "Money is integer minor units… Format once, at the edge, next to its currency code." | `merchant-console/CLAUDE.md` | Amounts reformatted twice or parsed back |
| "Return the same error shape everywhere: a status code that means what it says, and a body with a message safe to show a user." | `.claude/rules/api-routes.md` | Opaque failures |
| "Every input has a label, the dialog has an accessible name, focus moves into it and returns on close, Escape closes it." | `.claude/rules/components.md` | Inaccessible dialog |
| "Card last-four is **off** by default." | NWP-101 AC1 | Last-four leaks into merchant files |

## Approach

Keep the export on the server and extend what is there. `src/lib/csv.ts` gains a default column set without `last4`, and a pure `parseExportColumns` that turns the `columns` query param into a validated, de-duplicated, ordered list. It rejects unknown names and an empty selection. A missing param falls back to the default set, so last-four is excluded from any export that doesn't explicitly ask for it. The export route reads `columns` and an allowlisted `scope` (`filtered` | `all`), reuses `parseFilters` → `filterPayments` → `sortPayments`, and returns 400 `{ error }` on bad input. `exportFilename` takes an optional scope label (the status, `filtered`, or `all`, derived only from allowlisted values). On `/payments`, the Export link becomes a client component that opens the existing Drawer with column checkboxes (last-four unchecked), a scope radio (current filter by default), and a row count. The count comes from `GET /api/payments` with the same query, or no query for "all". Download is a link to the export URL and is disabled when no column is selected.

**Considered and rejected:**
- **Building the CSV in the browser from table rows:** exports only the current page of 20, which the ticket names as the bug.
- **A new count endpoint or a count computed in the page:** `GET /api/payments` already returns `total` through `parseFilters`, the same parser the export uses, so the count and the file cannot drift. `payments/page.tsx` hand-builds its own filters, so its numbers are not the source of truth.
- **A new `Dialog.tsx`:** the Drawer already provides the accessible Radix dialog, and the components rule says to use what is here.
- **Dropping the currency symbol from `amount`:** the criterion is already met, and the existing tests pin `$250.00`.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/lib/csv.ts` | change | `DEFAULT_EXPORT_COLUMNS`, `parseExportColumns`, scope label in `exportFilename` |
| `src/lib/csv.test.ts` | change | Tests for the column subset in order, last-four off by default, empty selection, unknown names, filename with scope |
| `src/app/api/payments/export/route.ts` | change | Read and validate `columns` and `scope`, return 400 on bad input, scoped filename |
| `src/app/payments/export-dialog.tsx` | add | Client component: Drawer, column checkboxes, scope radios, row count, Download |
| `src/app/payments/page.tsx` | change | Replace the Export link with the dialog, passing the current query |

## Plan

1. **csv helpers** — default columns, `parseExportColumns`, scoped `exportFilename`. Done when: `npm test` passes, with the 9 existing tests unchanged.
2. **Route** — wire `columns`/`scope` into `export/route.ts`. Done when: `curl` returns 200 CSV without `last4` by default, 200 with exactly the requested columns in order, 400 `{error}` for `columns=` and `columns=pan`, and a scoped `content-disposition` filename.
3. **Dialog** — `export-dialog.tsx` plus the change to `page.tsx`. Done when: on `/payments?status=disputed` the dialog opens with last-four unchecked, shows the disputed count, switches to the all-payments count, disables Download with no columns, and the downloaded file is named `payments-disputed-<date>.csv`.
4. **Tests** — the new cases in `csv.test.ts`. Done when: `npm test` passes, followed by `npm run lint` and `npx tsc --noEmit`.

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Choose columns; last-four off by default | `csv.test.ts`: "excludes last four by default" and "subset in requested order". Browser: checkbox unchecked on open |
| Scope current/all, default current, count visible | Browser: the count changes when the scope changes. `curl` with `scope=all` on a status filter returns every row |
| Filename reflects scope and date | `csv.test.ts` filename case. `curl -I` shows `payments-disputed-<date>.csv` |
| Minor units, formatted once, currency column | Existing tests at `csv.test.ts:32–41` stay green. No new formatter |
| Empty selection disables Download | Browser: Download disabled. `csv.test.ts` "rejects an empty selection". Route returns 400 |
| Server-side validation (notes) | `curl` with `columns=pan` returns 400 |

## Risks

- **Hand-edited URLs:** a hand-edited URL could still request `last4`. That is intended (ops may need it internally) but only by explicit choice, never by default.
- **Count and file can drift:** if rows change between opening the dialog and downloading, the count can be stale. This is acceptable for an in-memory store. The count is labelled "matching payments", not a guarantee.
- **Native checkboxes and radios:** no Checkbox component exists, so native inputs with Tailwind and explicit `<label>`s are used rather than adding a dependency.

## Out of scope

- The amount sort bug at `src/data/queries.ts:79–82`: separate ticket.
- `payments/page.tsx` not using `parseFilters`: noted, not refactored here.
- Date-range scope, saved column presets, and XLSX output.

## Open questions

- None that block the build. The amount format and the dialog primitive are decided above.
