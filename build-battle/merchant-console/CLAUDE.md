# Northwind Payments — Merchant Console

The internal tool support and ops staff use to look up a payment, refund it, work the dispute queue, and issue virtual cards.

Northwind Payments is fictional. Every merchant, cardholder, amount, and card in this app is generated.

## Run it

```bash
npm install
npm run dev                                             # http://localhost:3000, redirects to /overview
npm test                                                # Vitest, node env, src/**/*.test.ts
npx vitest run src/lib/csv.test.ts -t "exportFilename"  # one file, one test by name
npm run lint                                            # next lint
npx tsc --noEmit                                        # type-check (no script for it)
```

No database, no seed step, no Docker.

## Data lives in memory

Seed data is generated deterministically at boot by `src/data/generate.ts` (fixed seed, so everyone gets identical records); merchants are defined in `src/data/merchants.ts`. Both load into the store in `src/data/store.ts`, which route handlers and pages read and write.

- Writes last for the life of the dev server and vanish on restart. That is expected.
- Persistence is tracked separately as NWP-203. **Do not add a database, an ORM, or migrations.**
- If you need more seed data, extend the generator or the merchant list. Never edit seed data to make a failing case disappear.

## How requests reach the data

- Pages are async server components that call `src/data/queries.ts` directly; they do not fetch from the API.
- The route handlers are `GET /api/payments` (JSON, paginated at `PAGE_SIZE` = 20) and `GET /api/payments/export` (CSV).
- `queries.ts` is the query builder: `parseFilters` (the server-side allowlist for URL input), `filterPayments`, `sortPayments`, `paginate`, and `queryPayments`, which runs all three. Export filters and sorts without paginating, so it covers every matching row.
- Turn URL input into filters with `parseFilters`. `src/app/payments/page.tsx` builds its filters by hand; do not copy that.
- Known defect: `sortPayments` compares amounts as strings, so $90.00 sorts above $100.00.

## Where the rest of the context lives

This file loads every session, so it stays short. Detail that only matters once you open a particular kind of file lives in `.claude/rules/` and loads when you do:

| Rule | Applies to |
| --- | --- |
| `money.md` | `src/lib/`, `src/app/api/`, `src/data/` |
| `api-routes.md` | `src/app/api/` |
| `cards.md` | anything card-related |
| `components.md` | `src/components/`, `src/app/` |

## Conventions

These four explain most of the code, and breaking them is how bugs get in here.

1. **Money is integer minor units.** `$250.00` is `25000`. No floats, no strings with currency symbols. Format once, at the edge, next to its currency code.
2. **Storage and bucketing are UTC.** Display converts to the merchant's timezone. Nothing else does.
3. **One query builder.** Payment filtering goes through the builder behind `GET /api/payments`. A second implementation is a bug, not a shortcut.
4. **Validate on the server.** Anything from the client — column names, currencies, limits, statuses — is checked against an allowlist before it reaches a query, a filename, or the store.

## Card rules

- Generated numbers use the `4242` test BIN and a valid Luhn check digit. Nothing here may resemble a real PAN.
- The full number is returned exactly once, in the creation response. After that, last four only.
- Status is a state machine: `active ⇄ frozen`, either to `cancelled`, and `cancelled` is terminal.

## Layout

| Path | What lives there |
| --- | --- |
| `src/app/` | Console routes: overview, payments, disputes, payouts. Cards is NWP-201 and does not exist yet |
| `src/app/api/` | Route handlers |
| `src/data/` | Seed generator, merchants, the in-memory store, the query builder, and types |
| `src/components/` | Tremor-based primitives and the console's own components |
| `src/lib/` | Money, date, and CSV helpers, each with a `.test.ts` beside it. Read these before touching an amount |

## Before you push

Run `npm test`, then `/ship-ready`. The skill checks the rules above, not just formatting.
