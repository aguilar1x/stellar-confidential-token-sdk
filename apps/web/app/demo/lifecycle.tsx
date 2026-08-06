"use client";

import { useState } from "react";
import { Eye, EyeOff, ExternalLink } from "lucide-react";

import { EXPLORER } from "@/lib/demo";

/**
 * How money gets in, and where it stops being visible.
 *
 * This was four cards in a row, which threw away the two things the content
 * actually is: an ORDER, and a BOUNDARY. A grid says these are four peers; they
 * are not. So it is a rail instead, the track carries the sequence, and the
 * track itself changes at the step where value stops being public, because that
 * transition is the whole point of the section.
 *
 * Selecting a step opens it, so the detail is read one at a time rather than as
 * four columns of small print competing for attention.
 */

const STEPS = [
  {
    key: "register",
    title: "Register",
    body: "The unit publishes its spending and viewing public keys. Its secret was derived from a signature and stored nowhere, which is what lets the account be rebuilt later on a clean device.",
    visible: true,
    reveals: "that the account exists",
  },
  {
    key: "deposit",
    title: "Deposit",
    body: "Public XLM moves into the confidential pool. This amount IS on-chain, and cannot be otherwise: it is the boundary between the public balance and the private one, and something has to cross it.",
    visible: true,
    reveals: "how much entered the pool",
  },
  {
    key: "merge",
    title: "Merge",
    body: "The received balance folds into the spendable one. Two commitment points are added together; no amount is written down, because none was ever handed to the contract.",
    visible: false,
    reveals: "nothing at all",
  },
  {
    key: "transfer",
    title: "Transfer",
    body: "The dues are paid. A zero-knowledge proof asserts the sender had enough and that the arithmetic balances, without the amount appearing anywhere in the transaction.",
    visible: false,
    reveals: "who paid whom, and nothing else",
  },
] as const;

export function Lifecycle({ txs }: { txs: Partial<Record<string, string>> }) {
  const [open, setOpen] = useState(0);
  const step = STEPS[open]!;

  return (
    <div>
      {/* The rail. Public steps sit on a plain track; the moment value stops
          being visible, the track becomes the accent and stays that way. */}
      <ol className="grid grid-cols-4">
        {STEPS.map((s, i) => {
          const active = i === open;
          return (
            <li key={s.key}>
              <button
                onClick={() => setOpen(i)}
                aria-current={active ? "step" : undefined}
                className="group w-full pb-4 text-left"
              >
                <div className="relative mb-4 flex items-center">
                  <span
                    className={`absolute inset-x-0 top-1/2 h-px -translate-y-1/2 ${
                      s.visible ? "bg-rule-strong" : "bg-accent/35"
                    }`}
                  />
                  <span
                    className={`relative z-10 grid size-7 place-items-center rounded-full border-2 bg-paper font-mono text-[0.62rem] font-bold transition-colors ${
                      active
                        ? s.visible
                          ? "border-ink text-ink"
                          : "border-accent text-accent"
                        : s.visible
                          ? "border-rule-strong text-ink-soft group-hover:border-ink-soft"
                          : "border-accent/35 text-accent/70 group-hover:border-accent"
                    }`}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>

                <span
                  className={`block pr-4 text-[0.95rem] font-bold transition-colors ${
                    active ? "text-ink" : "text-ink-soft group-hover:text-ink"
                  }`}
                >
                  {s.title}
                </span>
                <span
                  className={`mt-1.5 flex items-center gap-1.5 font-mono text-[0.58rem] uppercase tracking-[0.1em] ${
                    s.visible ? "text-ink-soft" : "text-accent"
                  }`}
                >
                  {s.visible ? (
                    <Eye className="size-3 shrink-0" />
                  ) : (
                    <EyeOff className="size-3 shrink-0" />
                  )}
                  {s.visible ? "public" : "private"}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* One step at a time, under a rule that ties it back to the rail. */}
      <div className="border-t border-rule pt-6">
        <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-start">
          <p className="max-w-2xl text-[0.98rem] leading-relaxed text-ink-soft">
            {step.body}
          </p>

          <dl className="sm:text-right">
            <dt className="font-mono text-[0.58rem] uppercase tracking-[0.12em] text-ink-soft">
              reveals
            </dt>
            <dd
              className={`mt-1 text-[0.9rem] font-semibold ${
                step.visible ? "text-ink" : "text-accent"
              }`}
            >
              {step.reveals}
            </dd>
            {txs[step.key] && (
              <dd className="mt-3">
                <a
                  href={`${EXPLORER}/${txs[step.key]}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 font-mono text-[0.7rem] text-ink-soft transition-colors hover:text-accent"
                >
                  {txs[step.key]!.slice(0, 14)}…
                  <ExternalLink className="size-3" />
                </a>
              </dd>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}
