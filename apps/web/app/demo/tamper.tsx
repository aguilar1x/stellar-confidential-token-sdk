"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, ShieldAlert, Minus, Plus, RotateCcw } from "lucide-react";
import { commit, pointToBytes } from "stellar-confidential-token-sdk";

import { Provenance } from "@/components/provenance";

/**
 * The part of the page that asks the reader to break it.
 *
 * Everything else here is something we did and are reporting. This is the
 * reader's own arithmetic: the total and its blinding go in, `commit(v, r)` runs
 * IN THIS BROWSER via the published SDK, and the result is compared byte-for-byte
 * against the commitment the chain is holding. No server is consulted, so there
 * is nothing to take on trust — the refusal is computed on the reader's machine
 * from numbers they can edit.
 *
 * Why the byte-difference count is on screen: the interesting thing about a
 * one-stroop lie is not that it is caught, it is that it cannot be caught
 * *partially*. Pedersen commitments have no locality — the smallest possible
 * change to the value moves almost every byte of the point. A tamperer cannot
 * get close.
 *
 * The blinding is editable too, because otherwise the obvious objection is that
 * only the value is checked. Both are inputs to the same equation and either one
 * being wrong breaks it.
 */

const XLM = 10_000_000n;

const toHex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** XLM with all seven decimal places, so a single stroop is visible. */
function asXlm(stroops: bigint) {
  const neg = stroops < 0n;
  const abs = neg ? -stroops : stroops;
  const whole = abs / XLM;
  const frac = (abs % XLM).toString().padStart(7, "0");
  return `${neg ? "-" : ""}${whole.toLocaleString("en-US")}.${frac}`;
}

function parse(s: string): bigint | null {
  if (!/^-?\d+$/.test(s.trim())) return null;
  try {
    return BigInt(s.trim());
  } catch {
    return null;
  }
}

export function Tamper({
  total,
  blinding,
  onchainCommitment,
  contract,
  account,
  rpcUrl,
}: {
  total: string;
  blinding: string;
  onchainCommitment: string;
  contract: string;
  account: string;
  rpcUrl: string;
}) {
  const [v, setV] = useState(total);
  const [r, setR] = useState(blinding);

  const vNum = parse(v);
  const rNum = parse(r);

  /**
   * After mount, not during render — the same hydration trap the receipt panel
   * fell into. A `useMemo` here runs on the server too, and the `performance`
   * timing it stamps into the HTML can never match the one the browser
   * measures, so React discards the tree. An effect also keeps the promise the
   * heading makes: the arithmetic happens on the reader's machine, and nowhere
   * before it.
   */
  const [result, setResult] = useState<{ hex: string; ms: number } | null>(null);

  useEffect(() => {
    if (vNum === null || rNum === null || vNum < 0n || rNum < 0n) {
      setResult(null);
      return;
    }
    const t0 = performance.now();
    const bytes = pointToBytes(commit(vNum, rNum));
    setResult({ hex: toHex(bytes), ms: performance.now() - t0 });
  }, [vNum, rNum]);

  const matches = result?.hex === onchainCommitment;
  const untouched = v === total && r === blinding;

  // How many bytes of the point moved. Computed over the shorter of the two so a
  // malformed input can never make this throw.
  const bytesDiffer = useMemo(() => {
    if (!result) return 0;
    const n = Math.min(result.hex.length, onchainCommitment.length) / 2;
    let d = 0;
    for (let i = 0; i < n; i++) {
      if (result.hex.slice(i * 2, i * 2 + 2) !== onchainCommitment.slice(i * 2, i * 2 + 2)) d++;
    }
    return d;
  }, [result, onchainCommitment]);

  const nudge = (by: bigint) => {
    const cur = parse(v);
    if (cur !== null) setV((cur + by).toString());
  };

  const reset = () => {
    setV(total);
    setR(blinding);
  };

  return (
    <div
      className={`rounded-2xl border transition-colors ${
        !result ? "border-rule" : matches ? "border-verified/40" : "border-refused/45"
      }`}
    >
      <div className="border-b border-rule p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-lg">
            <h3 className="text-lg font-bold tracking-tight">Now try to lie about it</h3>
            <p className="mt-2 text-[0.94rem] leading-relaxed text-ink-soft">
              Change the total by one stroop, a ten-millionth of an XLM, the smallest
              amount that exists. Your browser recomputes{" "}
              <code className="font-mono text-[0.85em]">commit(v, r)</code> with the
              published SDK and compares it to what the chain is holding. Nothing is sent
              anywhere.
            </p>
          </div>

          <span
            className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 font-mono text-[0.68rem] font-bold uppercase tracking-[0.1em] ${
              !result
                ? "bg-paper-sunk text-ink-soft"
                : matches
                  ? "bg-emerald-50 text-verified"
                  : "bg-red-50 text-refused"
            }`}
          >
            {!result ? (
              "awaiting a number"
            ) : matches ? (
              <>
                <ShieldCheck className="size-3.5" />
                verified
              </>
            ) : (
              <>
                <ShieldAlert className="size-3.5" />
                refused
              </>
            )}
          </span>
        </div>
      </div>

      <div className="grid gap-6 p-6 sm:grid-cols-2">
        <Field
          label="total, in stroops"
          value={v}
          onChange={setV}
          invalid={vNum === null}
          hint={vNum !== null ? `${asXlm(vNum)} XLM` : "digits only"}
        />
        <Field
          label="summed blinding"
          value={r}
          onChange={setR}
          invalid={rNum === null}
          hint={rNum !== null ? "an element of the scalar field" : "digits only"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-rule px-6 py-4">
        <button
          onClick={() => nudge(-1n)}
          className="inline-flex items-center gap-1.5 rounded-md border border-rule px-3 py-1.5 font-mono text-xs transition-colors hover:border-refused/50 hover:text-refused"
        >
          <Minus className="size-3" />
          one stroop
        </button>
        <button
          onClick={() => nudge(1n)}
          className="inline-flex items-center gap-1.5 rounded-md border border-rule px-3 py-1.5 font-mono text-xs transition-colors hover:border-refused/50 hover:text-refused"
        >
          <Plus className="size-3" />
          one stroop
        </button>
        <button
          onClick={() => nudge(XLM)}
          className="rounded-md border border-rule px-3 py-1.5 font-mono text-xs transition-colors hover:border-refused/50 hover:text-refused"
        >
          + 1 XLM
        </button>
        {!untouched && (
          <button
            onClick={reset}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-rule px-3 py-1.5 text-xs text-ink-soft transition-colors hover:text-ink"
          >
            <RotateCcw className="size-3" />
            Back to the truth
          </button>
        )}
      </div>

      <div className="space-y-4 border-t border-rule bg-paper-sunk p-6">
        <Hex label="what the chain is holding" hex={onchainCommitment} />
        <Hex
          label="what your browser just computed"
          hex={result?.hex ?? ""}
          compareTo={onchainCommitment}
        />

        {result && (
          <p className="pt-1 text-sm leading-relaxed">
            {matches ? (
              <span className="text-ink-soft">
                Byte-for-byte identical. The commitment opens to this total, so the
                building&rsquo;s books are honest, and you did not have to believe us to
                find that out. Recomputed in {result.ms.toFixed(1)} ms.
              </span>
            ) : (
              <span className="text-ink">
                <strong className="font-semibold text-refused">Refused.</strong>{" "}
                {bytesDiffer} of {onchainCommitment.length / 2} bytes differ. That is the
                point worth noticing: a Pedersen commitment has no locality, so the
                smallest change that exists, one stroop, moves almost the entire point.
                There is no way to be nearly right, and nothing to negotiate with.
              </span>
            )}
          </p>
        )}
      </div>

      <Provenance
        contract={contract}
        account={account}
        rpcUrl={rpcUrl}
        what="the commitment and its opening"
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint: string;
  invalid: boolean;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        spellCheck={false}
        className={`mt-1.5 w-full rounded-lg border bg-paper px-3 py-2 font-mono text-sm tabular-nums outline-none transition-colors focus:border-accent ${
          invalid ? "border-refused/60" : "border-rule"
        }`}
      />
      <span
        className={`mt-1.5 block font-mono text-[0.68rem] ${
          invalid ? "text-refused" : "text-ink-soft"
        }`}
      >
        {hint}
      </span>
    </label>
  );
}

/** Hex in byte pairs, with the ones that moved marked when there is a baseline. */
function Hex({
  label,
  hex,
  compareTo,
}: {
  label: string;
  hex: string;
  compareTo?: string;
}) {
  const pairs = hex.match(/.{1,2}/g) ?? [];
  return (
    <div>
      <span className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
        {label}
      </span>
      <p className="mt-1.5 break-all font-mono text-[0.74rem] leading-relaxed">
        {pairs.length === 0 ? (
          <span className="text-ink-soft">none</span>
        ) : (
          pairs.map((p, i) => {
            const moved = compareTo ? compareTo.slice(i * 2, i * 2 + 2) !== p : false;
            return (
              <span
                key={i}
                className={moved ? "bg-red-100 font-bold text-refused" : "text-ink-soft"}
              >
                {p}
              </span>
            );
          })
        )}
      </p>
    </div>
  );
}
