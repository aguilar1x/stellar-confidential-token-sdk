"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, ExternalLink, AlertTriangle } from "lucide-react";

import { EXPLORER } from "@/lib/demo";
import type { PaymentResult } from "./pay";

const XLM = 10_000_000;

/**
 * The visitor's turn.
 *
 * Reading that a total stays auditable while its line items stay sealed is one
 * thing; watching the total move because you moved it is another. So this
 * submits a real transaction and then refreshes the page's server components,
 * which re-runs the audit against the chain — the same audit, with a number the
 * visitor caused.
 *
 * It takes several seconds and says so. A spinner with no explanation on a
 * button that spends money reads as a hang.
 */
export function PayButton({ pay }: { pay: () => Promise<PaymentResult> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setResult(null);
    const res = await pay();
    setResult(res);
    setBusy(false);
    // Re-run the audit with the payment included.
    if (res.ok) startTransition(() => router.refresh());
  };

  const working = busy || pending;

  return (
    <div className="rounded-2xl border border-rule bg-paper-sunk p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-md">
          <h2 className="text-lg font-bold tracking-tight">Add a payment yourself</h2>
          <p className="mt-2 text-[0.94rem] leading-relaxed text-ink-soft">
            A ninth resident pays 3 XLM. This submits a real transaction to Stellar testnet,
            then re-runs the audit above. The total will change; the individual amounts will
            still be sealed; the commitment will still verify.
          </p>
        </div>

        <button
          onClick={submit}
          disabled={working}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {working ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {busy ? "Proving and submitting…" : "Re-auditing…"}
            </>
          ) : (
            <>
              <Plus className="size-4" />
              Pay 3 XLM
            </>
          )}
        </button>
      </div>

      {working && busy && (
        <p className="mt-4 font-mono text-xs text-ink-soft">
          Generating an UltraHonk proof, then waiting for the ledger to close. Around ten
          seconds.
        </p>
      )}

      {result?.ok && result.tx && (
        <div className="mt-5 rounded-xl border border-verified/30 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-verified">
            Paid. The building&rsquo;s total above went up by 3 XLM.
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            The amount is not in that transaction — only a commitment to it is. Every other
            resident&rsquo;s payment stayed sealed, and the audit still verifies.
          </p>
          <a
            href={`${EXPLORER}/${result.tx}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 font-mono text-xs text-accent hover:underline"
          >
            {result.tx.slice(0, 24)}…
            <ExternalLink className="size-3" />
          </a>
        </div>
      )}

      {result && !result.ok && (
        <div className="mt-5 flex gap-3 rounded-xl border border-refused/30 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-refused" />
          <p className="text-sm leading-relaxed text-ink-soft">{result.error}</p>
        </div>
      )}
    </div>
  );
}
