"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Check, ExternalLink, AlertTriangle, Send, ArrowRight } from "lucide-react";

import { EXPLORER } from "@/lib/demo";
import {
  MAX_STROOPS,
  STAGES,
  type PaymentEvent,
  type StageKey,
  type Timings,
} from "./payment-types";
import { useStepAction } from "./steps";
import { saveReceipt } from "@/lib/receipt";

const XLM = 10_000_000n;

/**
 * The visitor's turn.
 *
 * Reading that a total stays auditable while no line item is written is one
 * thing; watching the total move because you moved it is another. So the amount
 * is the visitor's to choose, the four stages report as the server actually
 * finishes them, and the timings shown afterwards are measured rather than
 * quoted.
 *
 * Stage state comes off an NDJSON stream instead of a single round trip. That is
 * the difference between showing progress and animating a guess: nothing here
 * advances until the server says it did.
 */

/** Decimal XLM → stroops, without going through a float. */
function toStroops(input: string): bigint | null {
  const s = input.trim();
  if (!/^\d*(\.\d*)?$/.test(s) || s === "" || s === ".") return null;
  const [whole, frac = ""] = s.split(".");
  if (frac.length > 7) return null;
  return BigInt(whole || "0") * XLM + BigInt(frac.padEnd(7, "0") || "0");
}

const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`);

interface Done {
  tx: string;
  amountStroops: string;
  payloadBytes: number;
  timings: Timings;
}

export function PayButton() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const settled = useStepAction("pay");

  const [amount, setAmount] = useState("3");
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState<StageKey | null>(null);
  const [timings, setTimings] = useState<Timings>({});
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A live clock while in flight. Real elapsed time, so a long proof looks like
  // a long proof rather than like a hang.
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  useEffect(() => {
    if (!running) return;
    startedAt.current = performance.now();
    const id = setInterval(() => setElapsed(performance.now() - startedAt.current), 100);
    return () => clearInterval(id);
  }, [running]);

  const stroops = toStroops(amount);
  const overMax = stroops !== null && stroops > MAX_STROOPS;
  const valid = stroops !== null && stroops > 0n && !overMax;

  const submit = async () => {
    if (!valid) return;
    setRunning(true);
    setActive(null);
    setTimings({});
    setDone(null);
    setError(null);
    setElapsed(0);

    try {
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountStroops: stroops.toString() }),
      });
      if (!res.body) throw new Error("the endpoint returned no stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        buffer += decoder.decode(value, { stream: true });
        // A chunk can split a line, so hold the remainder back.
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as PaymentEvent;
          if (e.type === "started") setActive(e.stage);
          else if (e.type === "finished")
            setTimings((t) => ({ ...t, [e.stage]: e.ms }));
          else if (e.type === "done") {
            setActive(null);
            setDone({
              tx: e.tx,
              amountStroops: e.amountStroops,
              payloadBytes: e.payloadBytes,
              timings: e.timings,
            });
          } else if (e.type === "error") setError(e.error);
        }
      }
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setRunning(false);
      setActive(null);
    }
  };

  // Re-run the audit above with the payment included, and report the step as
  // done — a settled transaction is the action of this step, and the only thing
  // that should tick it off.
  useEffect(() => {
    if (!done) return;
    settled();
    // Kept for the rest of the visit, so /verify can show it again after the
    // reader has been anywhere else.
    saveReceipt({ tx: done.tx, amountStroops: done.amountStroops });
    startTransition(() => router.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const total = Object.values(timings).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div className="rounded-2xl border border-rule bg-paper-sunk">
      {/* The surrounding step already says what this does, so the control is just
          the control. A second heading here read as a second section. */}
      <div className="flex flex-wrap items-end justify-between gap-5 p-6">
        <p className="max-w-xs text-sm leading-relaxed text-ink-soft">
          Up to {MAX_STROOPS / XLM} XLM per payment. The four stages below report as the
          server actually finishes them.
        </p>

        <div className="flex items-end gap-3">
          <label className="block">
            <span className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
              amount
            </span>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={running}
                inputMode="decimal"
                spellCheck={false}
                aria-label="Amount in XLM"
                className={`w-28 rounded-lg border bg-paper px-3 py-2 text-right font-mono text-sm tabular-nums outline-none transition-colors focus:border-accent disabled:opacity-60 ${
                  amount !== "" && !valid ? "border-refused/60" : "border-rule"
                }`}
              />
              <span className="font-mono text-xs text-ink-soft">XLM</span>
            </div>
          </label>

          <button
            onClick={submit}
            disabled={running || !valid}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {running ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span className="tabular-nums">{fmtMs(elapsed)}</span>
              </>
            ) : (
              <>
                <Send className="size-3.5" />
                Pay
              </>
            )}
          </button>
        </div>
      </div>

      {amount !== "" && !valid && (
        <p className="px-6 pb-5 font-mono text-[0.7rem] text-refused">
          {overMax
            ? `The shared demo wallet caps a single payment at ${MAX_STROOPS / XLM} XLM.`
            : "Up to seven decimal places."}
        </p>
      )}

      {/* The four stages. Each one lights up when the server says it started and
          settles with the time it actually took. */}
      {(running || done || Object.keys(timings).length > 0) && (
        <ol className="divide-y divide-rule border-t border-rule">
          {STAGES.map((s) => {
            const ms = timings[s.key];
            const isActive = active === s.key;
            const complete = ms !== undefined;
            return (
              <li
                key={s.key}
                className={`flex items-center gap-3.5 px-6 py-3 transition-colors ${
                  isActive ? "bg-accent-soft" : ""
                }`}
              >
                <span className="grid size-5 shrink-0 place-items-center">
                  {isActive ? (
                    <Loader2 className="size-4 animate-spin text-accent" />
                  ) : complete ? (
                    <Check className="size-4 text-verified" />
                  ) : (
                    <span className="size-1.5 rounded-full bg-rule-strong" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm font-medium ${
                      complete || isActive ? "text-ink" : "text-ink-soft"
                    }`}
                  >
                    {s.label}
                  </span>
                  {(isActive || complete) && (
                    <span className="mt-0.5 block text-[0.8rem] leading-snug text-ink-soft">
                      {s.detail}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-ink-soft">
                  {complete ? fmtMs(ms) : isActive ? "…" : ""}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {/* Paper rather than a green wash: this strip closes a card that is
          already sunk, so lifting it to the page's own surface separates it
          without tinting. The verdict is in the sentence. */}
      {done && (
        <div className="border-t border-rule bg-paper p-6">
          <p className="text-sm font-semibold text-verified">
            Settled in {fmtMs(total)}. The total above has already moved.
          </p>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            The amount is not in that transaction — only a commitment to it is, inside{" "}
            {done.payloadBytes.toLocaleString("en-US")} bytes of proof. Every other
            payment stayed sealed, and the audit still opens.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {/* The receipt travels to /verify, so the visitor can re-open the
                commitment their own payment just moved — without a wallet, and
                without taking this box's word for any of it. */}
            <Link
              href={`/verify?receipt=${done.tx}&amount=${done.amountStroops}`}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Verify this receipt
              <ArrowRight className="size-3.5" />
            </Link>
            <a
              href={`${EXPLORER}/${done.tx}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-xs text-ink-soft hover:text-accent"
            >
              {done.tx.slice(0, 24)}…
              <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      )}

      {error && (
        <div className="flex gap-3 border-t border-rule bg-paper p-6">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-refused" />
          <p className="text-sm leading-relaxed text-ink-soft">{error}</p>
        </div>
      )}
    </div>
  );
}
