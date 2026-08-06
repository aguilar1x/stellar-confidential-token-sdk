"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { EXPLORER } from "@/lib/demo";
import { loadReceipts } from "@/lib/receipt";
import { ExplorerLink } from "./step-actions";

/**
 * The building's month, including whatever the reader has added to it.
 *
 * The table was built from the eight-unit fixture alone, so a visitor who paid
 * saw the total move and the footer gain a clause — but no row. Their own
 * transaction, the one thing on the page they caused, was the only one missing
 * from the list of what happened.
 *
 * Their payments go FIRST, newest at the top. Appending them would have pushed
 * the row they just created onto a second page, which is the opposite of what
 * paging is for.
 *
 * One deliberate asymmetry: every unit's amount reads `sealed`, and theirs does
 * not. That is not an inconsistency to hide — they are the payer, so they are
 * one of the two parties who can open it. The table showing exactly the amounts
 * a reader is entitled to see, and nothing else, is the thesis of the page
 * rendered as a column.
 */

const XLM = 10_000_000n;
const PAGE = 8;

function asXlm(stroops: bigint) {
  const whole = stroops / XLM;
  const frac = (stroops % XLM).toString().padStart(7, "0").replace(/0+$/, "");
  return frac ? `${whole.toLocaleString("en-US")}.${frac}` : whole.toLocaleString("en-US");
}

export interface UnitRow {
  id: string;
  label: string;
  tx: string | null;
}

interface Row {
  key: string;
  id: string;
  label: string;
  tx: string | null;
  /** Rendered instead of `sealed` when the reader is the payer. */
  openAmount: string | null;
}

export function LedgerTable({
  units,
  published,
  fromUnits,
}: {
  units: UnitRow[];
  published: string;
  fromUnits: string;
}) {
  const [mine, setMine] = useState<Row[]>([]);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setMine(
      loadReceipts().map((r, i) => ({
        key: r.tx,
        id: "You",
        label: i === 0 ? "your payment, most recent" : "your payment",
        tx: r.tx,
        openAmount: /^\d+$/.test(r.amountStroops)
          ? `${asXlm(BigInt(r.amountStroops))} XLM`
          : null,
      })),
    );
  }, []);

  const rows = useMemo<Row[]>(
    () => [
      ...mine,
      ...units.map((u) => ({
        key: u.id,
        id: u.id,
        label: u.label,
        tx: u.tx,
        openAmount: null,
      })),
    ],
    [mine, units],
  );

  const pages = Math.ceil(rows.length / PAGE);
  // A page that no longer exists after storage loads would render empty.
  const current = Math.min(page, Math.max(0, pages - 1));
  const shown = rows.slice(current * PAGE, current * PAGE + PAGE);

  return (
    <section className="overflow-hidden rounded-xl border border-rule bg-paper">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="border-b border-rule">
              {["Unit", "Type", "Paid", "On-chain"].map((h) => (
                <th
                  key={h}
                  className="px-5 py-3 text-left font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-ink-soft"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {shown.map((r) => (
              <tr key={r.key} className={r.openAmount ? "bg-paper-sunk" : undefined}>
                <td className="px-5 py-3 font-semibold">
                  {r.openAmount ? <span className="text-accent">{r.id}</span> : r.id}
                </td>
                <td className="px-5 py-3 text-ink-soft">{r.label}</td>
                <td className="px-5 py-3">
                  {r.openAmount ? (
                    <span className="font-mono font-semibold">{r.openAmount}</span>
                  ) : (
                    <span className="font-mono text-sealed">
                      <span aria-hidden className="mr-1.5 tracking-[0.1em] opacity-50">
                        ••••
                      </span>
                      sealed
                    </span>
                  )}
                </td>
                <td className="px-5 py-3">
                  {r.tx ? (
                    <ExplorerLink href={`${EXPLORER}/${r.tx}`} label={`${r.tx.slice(0, 10)}…`} />
                  ) : (
                    <span className="text-ink-soft">none</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>

          {/* Inside the table so the total keeps the columns, but outside the
              paging: it is the month, not a row, and it must not scroll away
              behind a page control. */}
          <tfoot>
            <tr className="border-t border-rule bg-paper-sunk">
              <td colSpan={2} className="px-5 py-4">
                <span className="font-semibold">Collected this month</span>
                {BigInt(published) > BigInt(fromUnits) && (
                  <span className="ml-2 text-sm text-ink-soft">
                    · {asXlm(BigInt(fromUnits))} XLM from the eight units,{" "}
                    {asXlm(BigInt(published) - BigInt(fromUnits))} XLM added by visitors
                  </span>
                )}
              </td>
              <td
                colSpan={2}
                className="px-5 py-4 text-right font-mono text-lg font-bold text-accent"
              >
                {asXlm(BigInt(published))} XLM
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Only when there is something to page through. A pager over eight rows
          is a control that exists to be looked at. */}
      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-rule bg-paper-sunk px-5 py-2.5">
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-ink-soft">
            {rows.length} rows · page {current + 1} of {pages}
          </span>
          <div className="flex gap-1.5">
            <PagerButton
              onClick={() => setPage(current - 1)}
              disabled={current === 0}
              label="Previous page"
            >
              <ChevronLeft className="size-3.5" />
            </PagerButton>
            <PagerButton
              onClick={() => setPage(current + 1)}
              disabled={current >= pages - 1}
              label="Next page"
            >
              <ChevronRight className="size-3.5" />
            </PagerButton>
          </div>
        </div>
      )}
    </section>
  );
}

function PagerButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid size-7 place-items-center rounded-md border border-rule bg-paper text-ink-soft transition-colors hover:text-ink disabled:opacity-40 disabled:hover:text-ink-soft"
    >
      {children}
    </button>
  );
}
