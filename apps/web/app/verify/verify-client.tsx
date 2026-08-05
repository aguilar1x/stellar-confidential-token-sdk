"use client";

import { useState, useTransition } from "react";
import { Loader2, ShieldCheck, ShieldAlert, Play, RotateCcw } from "lucide-react";

import { Reveal } from "@/components/reveal";
import { ARCHIVES, type ArchiveId } from "@/lib/demo";
import type { Verdict } from "./verdicts";

const XLM = 10_000_000;
const xlm = (stroops: string) =>
  `${(Number(stroops) / XLM).toLocaleString("en-US", { maximumFractionDigits: 7 })} XLM`;

type State = Record<string, { status: "idle" | "running" | "done"; verdict?: Verdict }>;

const initial: State = Object.fromEntries(ARCHIVES.map((a) => [a.id, { status: "idle" }]));

export function VerifyClient({ run }: { run: (id: ArchiveId) => Promise<Verdict> }) {
  const [state, setState] = useState<State>(initial);
  const [, startTransition] = useTransition();

  const check = (id: ArchiveId) => {
    setState((s) => ({ ...s, [id]: { status: "running" } }));
    startTransition(async () => {
      try {
        const verdict = await run(id);
        setState((s) => ({ ...s, [id]: { status: "done", verdict } }));
      } catch (e) {
        setState((s) => ({
          ...s,
          [id]: {
            status: "done",
            verdict: {
              archive: id,
              accepted: false,
              caughtBy: null,
              detail: String((e as Error)?.message ?? e),
            },
          },
        }));
      }
    });
  };

  const runAll = () => ARCHIVES.forEach((a) => check(a.id));
  const reset = () => setState(initial);

  const done = ARCHIVES.filter((a) => state[a.id]?.status === "done");
  const accepted = done.filter((a) => state[a.id]?.verdict?.accepted).length;

  return (
    <>
      <Reveal>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={runAll}
            className="group inline-flex items-center gap-2 rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            <Play className="size-3.5" />
            Check all five
          </button>
          {done.length > 0 && (
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-md border border-hairline px-4 py-2.5 text-sm text-muted transition-colors hover:text-foreground"
            >
              <RotateCcw className="size-3.5" />
              Reset
            </button>
          )}
          {done.length === ARCHIVES.length && (
            <p className="font-mono text-xs text-muted">
              {accepted} of {ARCHIVES.length} believed
            </p>
          )}
        </div>
      </Reveal>

      <div className="mt-8 grid gap-3">
        {ARCHIVES.map((a) => {
          const s = state[a.id] ?? { status: "idle" as const };
          const v = s.verdict;

          const border =
            s.status !== "done"
              ? "border-hairline"
              : v?.accepted
                ? "border-verified/40"
                : "border-refused/40";

          return (
            <article
              key={a.id}
              className={`rounded-xl border ${border} bg-surface transition-colors`}
            >
              <div className="flex flex-wrap items-start gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-[0.95rem] font-semibold">{a.title}</h3>
                    {s.status === "done" && (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[0.62rem] font-bold uppercase tracking-[0.1em] ${
                          v?.accepted
                            ? "bg-verified/12 text-verified"
                            : "bg-refused/12 text-refused"
                        }`}
                      >
                        {v?.accepted ? (
                          <ShieldCheck className="size-3" />
                        ) : (
                          <ShieldAlert className="size-3" />
                        )}
                        {v?.accepted ? "accepted" : "refused"}
                      </span>
                    )}
                    {s.status === "done" && v?.caughtBy && !v.accepted && (
                      <span className="font-mono text-[0.62rem] text-muted">
                        caught by {v.caughtBy}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{a.blurb}</p>
                </div>

                <button
                  onClick={() => check(a.id)}
                  disabled={s.status === "running"}
                  className="inline-flex shrink-0 items-center gap-2 rounded-md border border-hairline px-3.5 py-2 text-xs font-medium transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-50"
                >
                  {s.status === "running" ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Replaying…
                    </>
                  ) : s.status === "done" ? (
                    "Run again"
                  ) : (
                    "Replay history"
                  )}
                </button>
              </div>

              {s.status === "done" && v && (
                <div className="border-t border-hairline px-5 py-4">
                  <p className="text-sm leading-relaxed">{v.detail}</p>

                  {v.reported && v.truth && (
                    <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <dt className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-muted">
                          What it convinced the wallet of
                        </dt>
                        <dd className="mt-1.5 space-y-0.5 font-mono text-[0.8rem]">
                          <p
                            className={
                              v.reported.spendable !== v.truth.spendable
                                ? "font-semibold text-refused"
                                : "text-foreground"
                            }
                          >
                            spendable {xlm(v.reported.spendable)}
                          </p>
                          <p
                            className={
                              v.reported.receiving !== v.truth.receiving
                                ? "font-semibold text-refused"
                                : "text-foreground"
                            }
                          >
                            receiving {xlm(v.reported.receiving)}
                          </p>
                        </dd>
                      </div>
                      <div>
                        <dt className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-muted">
                          What the chain holds
                        </dt>
                        <dd className="mt-1.5 space-y-0.5 font-mono text-[0.8rem] text-foreground">
                          <p>spendable {xlm(v.truth.spendable)}</p>
                          <p>receiving {xlm(v.truth.receiving)}</p>
                        </dd>
                      </div>
                    </dl>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
