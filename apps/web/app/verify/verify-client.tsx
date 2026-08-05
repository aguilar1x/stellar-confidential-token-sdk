"use client";

import { useState, useTransition } from "react";
import { Loader2, ShieldCheck, ShieldAlert, Play, RotateCcw, Circle } from "lucide-react";

import { ARCHIVES, type ArchiveId } from "@/lib/demo";
import type { Verdict } from "./verdicts";

const XLM = 10_000_000;
const xlm = (stroops: string) =>
  `${(Number(stroops) / XLM).toLocaleString("en-US", { maximumFractionDigits: 7 })} XLM`;

type Entry = { status: "idle" | "running" | "done"; verdict?: Verdict };
type State = Record<string, Entry>;

const initial: State = Object.fromEntries(ARCHIVES.map((a) => [a.id, { status: "idle" }]));

/**
 * Five archives, read one at a time.
 *
 * This was five stacked cards — the layout that says "here are five unrelated
 * things", and that made a reader scroll past four results to compare two of
 * them. A list beside a detail panel keeps every verdict visible at once while
 * the reasoning for the selected one gets the room it needs, and the list
 * doubles as the scoreboard.
 */
export function VerifyClient({ run }: { run: (id: ArchiveId) => Promise<Verdict> }) {
  const [state, setState] = useState<State>(initial);
  const [selected, setSelected] = useState<ArchiveId>(ARCHIVES[0].id);
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

  const current = ARCHIVES.find((a) => a.id === selected)!;
  const entry = state[selected] ?? { status: "idle" as const };
  const v = entry.verdict;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-rule pb-6">
        <button
          onClick={runAll}
          className="btn-raised inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white"
        >
          <Play className="size-3.5" />
          Check all five
        </button>
        {done.length > 0 && (
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-full border border-rule px-4 py-2.5 text-sm text-ink-soft transition-colors hover:text-ink"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </button>
        )}
        {done.length === ARCHIVES.length && (
          <p className="font-mono text-xs text-ink-soft">
            {accepted} of {ARCHIVES.length} believed
          </p>
        )}
      </div>

      <div className="grid lg:grid-cols-[15rem_1fr]">
        <ul className="divide-y divide-rule border-b border-rule lg:border-b-0 lg:border-r">
          {ARCHIVES.map((a) => {
            const e = state[a.id] ?? { status: "idle" as const };
            const active = a.id === selected;
            return (
              <li key={a.id}>
                <button
                  onClick={() => setSelected(a.id)}
                  aria-current={active ? "true" : undefined}
                  className={`flex w-full items-center gap-2.5 py-3.5 pr-6 text-left transition-colors ${
                    active ? "text-ink" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  <span className="shrink-0">
                    {e.status === "running" ? (
                      <Loader2 className="size-3.5 animate-spin text-ink-soft" />
                    ) : e.status === "done" ? (
                      e.verdict?.accepted ? (
                        <ShieldCheck className="size-3.5 text-verified" />
                      ) : (
                        <ShieldAlert className="size-3.5 text-refused" />
                      )
                    ) : (
                      <Circle className="size-3.5 text-rule-strong" />
                    )}
                  </span>
                  <span className={`flex-1 text-[0.9rem] ${active ? "font-semibold" : ""}`}>
                    {a.title}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="pt-6 lg:pl-8 lg:pt-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-lg">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-lg font-bold tracking-tight">{current.title}</h2>
                {entry.status === "done" && (
                  <>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.1em] ${
                        v?.accepted ? "bg-emerald-50 text-verified" : "bg-red-50 text-refused"
                      }`}
                    >
                      {v?.accepted ? "accepted" : "refused"}
                    </span>
                    {v?.caughtBy && !v.accepted && (
                      <span className="font-mono text-[0.62rem] text-ink-soft">
                        caught by {v.caughtBy}
                      </span>
                    )}
                  </>
                )}
              </div>
              <p className="mt-2 text-[0.94rem] leading-relaxed text-ink-soft">
                {current.blurb}
              </p>
            </div>

            <button
              onClick={() => check(current.id)}
              disabled={entry.status === "running"}
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-rule px-4 py-2 text-xs font-medium transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-50"
            >
              {entry.status === "running" ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Replaying…
                </>
              ) : entry.status === "done" ? (
                "Run again"
              ) : (
                "Replay history"
              )}
            </button>
          </div>

          {entry.status === "done" && v ? (
            <div className="mt-6 border-t border-rule pt-6">
              <p className="max-w-2xl text-[0.94rem] leading-relaxed">{v.detail}</p>

              {v.reported && v.truth && (
                <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                  <div>
                    <dt className="font-mono text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-ink-soft">
                      What it convinced the wallet of
                    </dt>
                    <dd className="mt-2 space-y-1 font-mono text-[0.82rem]">
                      <p
                        className={
                          v.reported.spendable !== v.truth.spendable
                            ? "font-bold text-refused"
                            : "text-ink"
                        }
                      >
                        spendable {xlm(v.reported.spendable)}
                      </p>
                      <p
                        className={
                          v.reported.receiving !== v.truth.receiving
                            ? "font-bold text-refused"
                            : "text-ink"
                        }
                      >
                        receiving {xlm(v.reported.receiving)}
                      </p>
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-ink-soft">
                      What the chain holds
                    </dt>
                    <dd className="mt-2 space-y-1 font-mono text-[0.82rem] text-ink">
                      <p>spendable {xlm(v.truth.spendable)}</p>
                      <p>receiving {xlm(v.truth.receiving)}</p>
                    </dd>
                  </div>
                </dl>
              )}
            </div>
          ) : (
            <p className="mt-6 border-t border-rule pt-6 text-[0.9rem] text-ink-soft">
              {entry.status === "running"
                ? "Fetching this archive's history and replaying it…"
                : "Not checked yet. Replay this archive's history and see what the client makes of it."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
