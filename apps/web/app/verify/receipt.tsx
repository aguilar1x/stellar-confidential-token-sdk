"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, ShieldAlert, ExternalLink } from "lucide-react";
import { commit, pointToBytes } from "stellar-confidential-token-sdk";

import { EXPLORER } from "@/lib/demo";
import type { StoredReceipt } from "@/lib/receipt";
import { Provenance } from "@/components/provenance";

/**
 * The visitor's own payment, re-opened on their machine.
 *
 * They paid on /demo and were told it worked. This runs the check again with
 * nothing between them and the answer: `commit(total, blinding)` executes in
 * THIS browser via the published SDK and is compared byte-for-byte against the
 * commitment the chain is holding right now.
 *
 * Two things are deliberately NOT claimed here. The commitment opening proves
 * the building's published total is the one the chain holds — it does not, on
 * its own, prove which payments compose it. And the total may have moved again
 * between the payment and this page load, because other visitors can pay too.
 * Both are said out loud below rather than papered over: a check that overstates
 * what it establishes is worth less than one that does not.
 */

const XLM = 10_000_000n;

const toHex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

function asXlm(stroops: bigint) {
  const whole = stroops / XLM;
  const frac = (stroops % XLM).toString().padStart(7, "0").replace(/0+$/, "");
  return frac ? `${whole.toLocaleString("en-US")}.${frac}` : whole.toLocaleString("en-US");
}

export function Receipt({
  receipts,
  total,
  blinding,
  onchainCommitment,
  contract,
  account,
  rpcUrl,
}: {
  receipts: StoredReceipt[];
  total: string;
  blinding: string;
  onchainCommitment: string;
  contract: string;
  account: string;
  rpcUrl: string;
}) {
  /**
   * What this visitor put in, across the whole visit.
   *
   * There is still only ONE commitment check, because the chain holds one
   * commitment for the building's whole balance — not one per payment. So the
   * panel sums their payments and lists them, and the check underneath is the
   * same single check it always was, now standing next to a number that
   * accounts for all of it rather than for whichever payment was last.
   */
  const amount = useMemo(() => {
    let sum = 0n;
    let known = false;
    for (const r of receipts) {
      if (!/^\d+$/.test(r.amountStroops)) continue;
      try {
        sum += BigInt(r.amountStroops);
        known = true;
      } catch {
        // Skip an unparseable entry rather than dropping the whole receipt.
      }
    }
    return known ? sum : null;
  }, [receipts]);

  /**
   * Computed after mount, never during render.
   *
   * This is a client component, which Next still renders once on the server —
   * so a `useMemo` here ran the curve arithmetic there too and stamped a server
   * timing into the HTML. The client then measured its own and React reported a
   * hydration mismatch, because the two numbers are never the same number.
   *
   * Moving it into an effect fixes the mismatch and something worse behind it:
   * the sentence below claims your browser did this, and until now the server
   * had done it first.
   */
  const [recomputed, setRecomputed] = useState<{ hex: string; ms: number } | null>(null);

  useEffect(() => {
    if (!/^\d+$/.test(total) || !/^\d+$/.test(blinding)) return;
    const t0 = performance.now();
    const hex = toHex(pointToBytes(commit(BigInt(total), BigInt(blinding))));
    setRecomputed({ hex, ms: performance.now() - t0 });
  }, [total, blinding]);

  /** Three states, because "not yet" is not the same claim as "does not open". */
  const verdict = !recomputed
    ? "pending"
    : recomputed.hex === onchainCommitment && onchainCommitment.length > 0
      ? "opens"
      : "refused";

  return (
    <section
      className={`rounded-2xl border ${
        verdict === "pending"
          ? "border-rule"
          : verdict === "opens"
            ? "border-verified/40"
            : "border-refused/45"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-rule p-6">
        <div className="max-w-lg">
          <p className="eyebrow">{receipts.length > 1 ? "Your receipts" : "Your receipt"}</p>
          {/**
           * The heading used to read "here is the check", which a reader takes
           * to mean their transaction was verified. It was not, and still is
           * not: what gets checked is the building's total — the number their
           * payment moved. The claim now matches the arithmetic underneath it,
           * because a check that is real and mislabelled is worse on this page
           * than one that is obviously decorative.
           */}
          <h2 className="mt-2 text-xl font-bold tracking-tight">
            {amount !== null ? (
              <>
                You added {asXlm(amount)} XLM
                {receipts.length > 1 && <> across {receipts.length} payments</>}. Here is the
                total it moved, checked on your machine.
              </>
            ) : (
              <>Here is the total your payment moved, checked on your machine.</>
            )}
          </h2>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 font-mono text-[0.68rem] font-bold uppercase tracking-[0.1em] ${
            verdict === "pending"
              ? "bg-paper-sunk text-ink-soft"
              : verdict === "opens"
                ? "bg-emerald-50 text-verified"
                : "bg-red-50 text-refused"
          }`}
        >
          {verdict === "pending" ? null : verdict === "opens" ? (
            <ShieldCheck className="size-3.5" />
          ) : (
            <ShieldAlert className="size-3.5" />
          )}
          {verdict === "pending" ? "checking" : verdict === "opens" ? "verified" : "mismatch"}
        </span>
      </div>

      <dl className="grid gap-5 p-6 sm:grid-cols-3">
        <div>
          <dt className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
            {receipts.length > 1 ? "you paid, in total" : "you paid"}
          </dt>
          <dd className="mt-1.5 font-mono text-base font-semibold">
            {amount !== null ? `${asXlm(amount)} XLM` : "—"}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
            the building&rsquo;s total now
          </dt>
          <dd className="mt-1.5 font-mono text-base font-semibold">
            {/^\d+$/.test(total) ? `${asXlm(BigInt(total))} XLM` : "—"}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
            recomputed in
          </dt>
          <dd className="mt-1.5 font-mono text-base font-semibold">
            {recomputed ? `${recomputed.ms.toFixed(1)} ms` : "—"}
          </dd>
        </div>
      </dl>

      {/* Each payment on its own row, newest first. The sum above is the number
          the check stands next to; these are what it is made of, and every one
          is openable on an explorer we do not control. */}
      <ol className="divide-y divide-rule border-t border-rule">
        {receipts.map((r, i) => (
          <li key={r.tx} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-6 py-3">
            <span className="w-6 shrink-0 font-mono text-[0.62rem] text-ink-soft">
              {receipts.length - i}
            </span>
            <span className="font-mono text-sm font-semibold">
              {/^\d+$/.test(r.amountStroops) ? `${asXlm(BigInt(r.amountStroops))} XLM` : "—"}
            </span>
            <a
              href={`${EXPLORER}/${r.tx}`}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 font-mono text-xs text-ink-soft hover:text-accent"
            >
              {r.tx.slice(0, 16)}…
              <ExternalLink className="size-3" />
            </a>
          </li>
        ))}
      </ol>

      <div className="border-t border-rule bg-paper-sunk p-6">
        <p className="text-sm leading-relaxed">
          {verdict === "pending" ? (
            <span className="text-ink-soft">
              Recomputing <code className="font-mono text-[0.85em]">commit(v, r)</code> in this
              browser.
            </span>
          ) : verdict === "opens" ? (
            <>
              <strong className="font-semibold text-verified">It opens.</strong> Your browser
              recomputed <code className="font-mono text-[0.85em]">commit(v, r)</code> with the
              published SDK and got back, byte for byte, the point the chain is holding — a
              total that now includes your payment. No server was asked.
            </>
          ) : (
            <>
              <strong className="font-semibold text-refused">It does not open.</strong> The
              point your browser computed is not the one the chain is holding. If you have not
              edited anything, that is a real mismatch and worth reporting.
            </>
          )}
        </p>
        {/* Raised out of fine print. These limits are the difference between
            what the panel proves and what its heading could be read to claim,
            so they are part of the claim rather than a disclaimer under it. */}
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          <strong className="font-semibold text-ink">What this does not prove.</strong> The
          check is on the building&rsquo;s total, not on your transaction. It establishes that
          the published total is the one the chain committed to — not, by itself, which
          payments compose it. Other visitors can pay while you read, so the total may have
          moved again since {receipts.length > 1 ? "your last receipt" : "your receipt"}. The
          amounts themselves are in none of it: open any transaction above and look for one.
        </p>
      </div>

      <Provenance
        contract={contract}
        account={account}
        rpcUrl={rpcUrl}
        what="the building's total, its blinding and the commitment"
      />
    </section>
  );
}
