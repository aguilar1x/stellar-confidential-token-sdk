"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowRight, Check } from "lucide-react";

/**
 * The demo as three tabs rather than three sections of scroll.
 *
 * Three things this has to get right, and none of them are about looks.
 *
 * A tick means the visitor DID the step, never that they opened it. Marking a
 * tab complete on arrival is a progress bar that fills itself, it tells a judge
 * their own attention is an accomplishment, and it lies about the one thing this
 * page is asking them to establish. So completion arrives from the panel
 * content, through `useStepAction`, when a real event happens: a block explorer
 * opened, a payment settled on testnet, a departure to the adversarial page.
 *
 * The one exception is the step's own Next button, which marks the step it is
 * leaving. That is still an act rather than an arrival: the visitor read the
 * panel and decided to go on. Without it the first step ticks only for someone
 * who happens to open an explorer link, so the ordinary path through the page
 * ends with an empty box beside a step that was in fact completed.
 *
 * Panels stay MOUNTED and are hidden with the `hidden` attribute instead of
 * being conditionally rendered. A visitor pays under tab 2, clicks tab 3 to see
 * what checking involves, and comes back, unmounting would have thrown away
 * their transaction hash, their timings and their receipt link, which is the one
 * piece of state on this page that cannot be recreated without paying again.
 *
 * And completion survives leaving. Step 3's action is a navigation, so its own
 * tick would be gone the instant it was earned; the set is mirrored into
 * sessionStorage and read back after mount, which also means a judge returning
 * with the back button still sees the payment they made.
 */

const KEY = "ct-demo-steps-done";

const StepsContext = createContext<((id: string) => void) | null>(null);

/**
 * Report that this step's action happened.
 *
 * Returns a stable no-op outside a `Steps` tree, so a panel component stays
 * usable on its own.
 */
export function useStepAction(id: string) {
  const mark = useContext(StepsContext);
  return useCallback(() => mark?.(id), [mark, id]);
}

export interface Step {
  /** Stable id the panel's content reports completion against. */
  id: string;
  title: string;
  /** Shown under the tab strip, above the panel. */
  blurb: ReactNode;
  content: ReactNode;
}

export function Steps({ steps }: { steps: Step[] }) {
  const [active, setActive] = useState(0);
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const base = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  // Read after mount rather than during render: sessionStorage does not exist on
  // the server, and seeding state from it would hydrate against different HTML.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(KEY);
      if (saved) setDone(new Set(JSON.parse(saved) as string[]));
    } catch {
      // Private mode, or a storage quota. A missing tick is not worth an error.
    }
  }, []);

  const mark = useCallback((id: string) => {
    setDone((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev).add(id);
      try {
        sessionStorage.setItem(KEY, JSON.stringify([...next]));
      } catch {
        // Same.
      }
      return next;
    });
  }, []);

  const go = (i: number) => setActive(i);

  /** Arrow keys move between tabs, which is what a tablist is expected to do. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (active + delta + steps.length) % steps.length;
    go(next);
    tabs.current[next]?.focus();
  };

  return (
    <StepsContext.Provider value={mark}>
      <div className="mt-14">
        <div
          role="tablist"
          aria-label="Demo steps"
          onKeyDown={onKeyDown}
          /**
           * `overflow-y-hidden` is load-bearing, not tidying.
           *
           * Setting only `overflow-x: auto` does not leave the other axis
           * alone: per spec, an `overflow-y: visible` beside a non-visible
           * `overflow-x` computes to `auto`. The tabs carry `-mb-px` so the
           * active underline lands on the container's rule instead of above
           * it: one pixel of vertical overflow, which was enough for that
           * silently-promoted `auto` to render a scrollbar down the strip.
           */
          className="-mx-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-rule px-6"
        >
          {steps.map((s, i) => {
            const on = i === active;
            const complete = done.has(s.id);
            return (
              <button
                key={s.id}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                role="tab"
                id={`${base}-tab-${i}`}
                aria-selected={on}
                aria-controls={`${base}-panel-${i}`}
                tabIndex={on ? 0 : -1}
                onClick={() => go(i)}
                className={`-mb-px flex shrink-0 items-center gap-2.5 border-b-2 px-1 py-3.5 pr-5 text-[0.95rem] transition-colors ${
                  on
                    ? "border-accent font-semibold text-ink"
                    : "border-transparent text-ink-soft hover:text-ink"
                }`}
              >
                <span
                  aria-hidden
                  className={`grid size-6 shrink-0 place-items-center rounded-full font-mono text-[0.7rem] font-bold transition-colors ${
                    complete
                      ? "bg-verified text-white"
                      : on
                        ? "bg-accent text-white"
                        : "bg-paper-sunk text-ink-soft"
                  }`}
                >
                  {complete ? <Check className="size-3.5" /> : i + 1}
                </span>
                {s.title}
                {complete && <span className="sr-only">(done)</span>}
              </button>
            );
          })}
        </div>

        {steps.map((s, i) => (
          <div
            key={s.id}
            role="tabpanel"
            id={`${base}-panel-${i}`}
            aria-labelledby={`${base}-tab-${i}`}
            hidden={i !== active}
            tabIndex={0}
            className="pt-8 outline-none"
          >
            <p className="max-w-2xl text-[0.94rem] leading-relaxed text-ink-soft">{s.blurb}</p>
            <div className="mt-6">{s.content}</div>

            {i < steps.length - 1 && (
              <div className="mt-8 border-t border-rule pt-6">
                <button
                  onClick={() => {
                    // Advancing is itself the action for this step. A visitor who
                    // read the ledger and chose to move on has done what the step
                    // asks; requiring them to also open a block explorer to earn
                    // the tick means the common path leaves it permanently empty,
                    // which reads as a step that failed rather than one finished.
                    mark(s.id);
                    go(i + 1);
                    tabs.current[i + 1]?.focus();
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Next · {steps[i + 1].title}
                  <ArrowRight className="size-4" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </StepsContext.Provider>
  );
}
