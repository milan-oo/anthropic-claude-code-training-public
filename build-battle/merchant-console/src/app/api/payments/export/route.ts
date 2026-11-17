import { filterPayments, parseFilters, sortPayments } from "@/data/queries"
import {
  exportFilename,
  exportScopeLabel,
  parseExportColumns,
  parseExportScope,
  toCsv,
} from "@/lib/csv"
import { NextRequest, NextResponse } from "next/server"

/**
 * Exports the payments table as CSV.
 *
 * Query params:
 * - the usual payment filters, read through parseFilters
 * - `scope`: `filtered` (default) or `all`, which ignores the filters
 * - `columns`: comma-separated column names; defaults to every column
 *   except the card last four
 *
 * Runs on the server over the whole store, never one page of the table.
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams

  const scope = parseExportScope(params.get("scope"))
  if (!scope) return badRequest('Scope must be "filtered" or "all".')

  const columns = parseExportColumns(params.get("columns"))
  if (!columns.ok) return badRequest(columns.error)

  // "All payments" drops the filters but keeps the requested order.
  const filters = parseFilters(scope === "all" ? orderOnly(params) : params)
  const rows = sortPayments(
    filterPayments(filters),
    filters.sort,
    filters.direction,
  )

  const filename = exportFilename(new Date(), exportScopeLabel(scope, filters))

  return new Response(toCsv(rows, columns.columns), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  })
}

function orderOnly(params: URLSearchParams): URLSearchParams {
  const kept = new URLSearchParams()
  for (const key of ["sort", "direction"]) {
    const value = params.get(key)
    if (value) kept.set(key, value)
  }
  return kept
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}
