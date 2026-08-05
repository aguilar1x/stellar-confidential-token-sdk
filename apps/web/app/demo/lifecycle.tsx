import { Eye, EyeOff, ExternalLink } from "lucide-react";

import { EXPLORER } from "@/lib/demo";

/**
 * How money actually gets in, moves, and stays auditable.
 *
 * The rest of the page starts at "eight payments happened", which skips the
 * part a reader most needs in order to trust it — and skips the part the
 * protocol is least flattering about. Deposits are public. Saying so here, in
 * the same visual language as the private steps, is more convincing than a
 * limitations footnote nobody reads.
 */

const STEPS = [
  {
    key: "register",
    title: "Register",
    body: "The unit publishes its spending and viewing public keys. Its secret was derived from a signature and stored nowhere.",
    visible: true,
    reveals: "the account exists",
  },
  {
    key: "deposit",
    title: "Deposit",
    body: "Public XLM moves into the confidential pool. This amount IS on-chain — it is the boundary between the public balance and the private one, and it cannot be hidden.",
    visible: true,
    reveals: "how much entered the pool",
  },
  {
    key: "merge",
    title: "Merge",
    body: "The received balance folds into the spendable one. Two commitment points are added; no amount appears.",
    visible: false,
    reveals: "nothing",
  },
  {
    key: "transfer",
    title: "Transfer",
    body: "The dues are paid. A proof asserts the sender had enough and the arithmetic is right, without the amount ever being written down.",
    visible: false,
    reveals: "who paid whom, and nothing else",
  },
] as const;

export function Lifecycle({ txs }: { txs: Partial<Record<string, string>> }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((s, i) => (
        <li
          key={s.key}
          className={`flex flex-col rounded-xl border p-5 ${
            s.visible ? "border-rule bg-paper-sunk" : "border-accent/25 bg-accent-soft"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-[0.62rem] font-bold text-ink-soft">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="text-[0.95rem] font-bold">{s.title}</h3>
          </div>

          <p className="mt-2.5 flex-1 text-[0.86rem] leading-relaxed text-ink-soft">{s.body}</p>

          <div className="mt-4 flex items-center gap-1.5 border-t border-rule pt-3">
            {s.visible ? (
              <Eye className="size-3.5 shrink-0 text-ink-soft" />
            ) : (
              <EyeOff className="size-3.5 shrink-0 text-accent" />
            )}
            <span
              className={`font-mono text-[0.62rem] uppercase tracking-[0.1em] ${
                s.visible ? "text-ink-soft" : "text-accent"
              }`}
            >
              reveals {s.reveals}
            </span>
          </div>

          {txs[s.key] && (
            <a
              href={`${EXPLORER}/${txs[s.key]}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 font-mono text-[0.68rem] text-ink-soft hover:text-accent"
            >
              {txs[s.key]!.slice(0, 12)}…
              <ExternalLink className="size-2.5" />
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}
