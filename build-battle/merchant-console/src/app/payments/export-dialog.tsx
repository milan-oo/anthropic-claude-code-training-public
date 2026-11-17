"use client"

import { Button } from "@/components/Button"
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/Drawer"
import {
  DEFAULT_EXPORT_COLUMNS,
  EXPORT_COLUMNS,
  ExportColumn,
  ExportScope,
} from "@/lib/csv"
import { Download } from "lucide-react"
import { useEffect, useState } from "react"

const COLUMN_LABELS: Record<ExportColumn, string> = {
  id: "Payment ID",
  created_at: "Created (UTC)",
  merchant: "Merchant",
  description: "Description",
  status: "Status",
  method: "Method",
  card_brand: "Card brand",
  last4: "Card last four",
  amount: "Amount",
  currency: "Currency",
}

type Counts = { filtered: number; all: number }

/**
 * Export options for the payments table (NWP-101).
 *
 * The file is still built by GET /api/payments/export, which validates the
 * columns and scope. This dialog only chooses them. The row count comes from
 * GET /api/payments, which reads the same filters through the same parser,
 * so the count matches the file.
 */
export function ExportDialog({ query }: { query: string }) {
  const [open, setOpen] = useState(false)
  const [columns, setColumns] = useState<Set<ExportColumn>>(
    () => new Set(DEFAULT_EXPORT_COLUMNS),
  )
  const [scope, setScope] = useState<ExportScope>("filtered")
  const [counts, setCounts] = useState<Counts | null>(null)
  const [countFailed, setCountFailed] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setCounts(null)
    setCountFailed(false)

    const total = (url: string) =>
      fetch(url).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<{ total: number }>
      })

    Promise.all([total(`/api/payments?${query}`), total("/api/payments")])
      .then(([filtered, all]) => {
        if (!cancelled) setCounts({ filtered: filtered.total, all: all.total })
      })
      .catch(() => {
        if (!cancelled) setCountFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [open, query])

  const toggle = (column: ExportColumn) =>
    setColumns((current) => {
      const next = new Set(current)
      if (next.has(column)) next.delete(column)
      else next.add(column)
      return next
    })

  // Columns ship in the table's canonical order, whatever order they were ticked.
  const selected = EXPORT_COLUMNS.filter((column) => columns.has(column))
  const params = new URLSearchParams(query)
  params.set("scope", scope)
  params.set("columns", selected.join(","))
  const href = `/api/payments/export?${params.toString()}`

  const count = counts ? (scope === "all" ? counts.all : counts.filtered) : null

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant="secondary" className="w-full gap-2 py-1.5 sm:w-fit">
          <Download
            className="-ml-0.5 size-4 shrink-0 text-gray-400 dark:text-gray-600"
            aria-hidden="true"
          />
          Export
        </Button>
      </DrawerTrigger>
      <DrawerContent className="sm:max-w-md">
        <DrawerHeader>
          <DrawerTitle>Export payments</DrawerTitle>
          <DrawerDescription>
            Choose what goes into the CSV before you download it.
          </DrawerDescription>
        </DrawerHeader>

        <DrawerBody className="flex flex-col gap-6">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-gray-900 dark:text-gray-50">
              Payments
            </legend>
            <ScopeOption
              id="export-scope-filtered"
              label="Current filter"
              checked={scope === "filtered"}
              onSelect={() => setScope("filtered")}
            />
            <ScopeOption
              id="export-scope-all"
              label="All payments"
              checked={scope === "all"}
              onSelect={() => setScope("all")}
            />
            <p
              className="text-sm text-gray-500 tabular-nums"
              aria-live="polite"
            >
              {countFailed
                ? "Couldn't load the row count. The export still works."
                : count === null
                  ? "Counting rows…"
                  : `${count.toLocaleString()} ${count === 1 ? "row" : "rows"} will be exported`}
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-gray-900 dark:text-gray-50">
              Columns
            </legend>
            {EXPORT_COLUMNS.map((column) => (
              <div key={column} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`export-column-${column}`}
                  checked={columns.has(column)}
                  onChange={() => toggle(column)}
                  className="size-4 accent-blue-500"
                />
                <label
                  htmlFor={`export-column-${column}`}
                  className="text-sm text-gray-700 dark:text-gray-300"
                >
                  {COLUMN_LABELS[column]}
                </label>
              </div>
            ))}
            <p className="text-sm text-gray-500">
              Card last four is off by default. Turn it on only for files that
              stay inside Northwind.
            </p>
          </fieldset>
        </DrawerBody>

        <DrawerFooter className="items-center gap-2">
          {selected.length === 0 && (
            <p className="mr-auto text-sm text-red-600 dark:text-red-500" role="status">
              Choose at least one column.
            </p>
          )}
          <DrawerClose asChild>
            <Button variant="secondary" className="w-full sm:w-fit">
              Cancel
            </Button>
          </DrawerClose>
          {selected.length === 0 ? (
            <Button className="w-full sm:w-fit" disabled>
              Download CSV
            </Button>
          ) : (
            <Button className="w-full sm:w-fit" asChild>
              <a href={href} onClick={() => setOpen(false)}>
                Download CSV
              </a>
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function ScopeOption({
  id,
  label,
  checked,
  onSelect,
}: {
  id: string
  label: string
  checked: boolean
  onSelect: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="radio"
        id={id}
        name="export-scope"
        checked={checked}
        onChange={onSelect}
        className="size-4 accent-blue-500"
      />
      <label htmlFor={id} className="text-sm text-gray-700 dark:text-gray-300">
        {label}
      </label>
    </div>
  )
}
