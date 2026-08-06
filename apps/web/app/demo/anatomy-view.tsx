import { ExternalLink, Eye, EyeOff } from "lucide-react";

import { EXPLORER } from "@/lib/demo";
import type { PaymentAnatomy as Data } from "./anatomy";

const XLM = 10_000_000;

/**
 * The moment the page exists for.
 *
 * On the left, every field the chain stores for one real payment — the whole
 * list, so a reader can check for themselves that no amount is among them. On
 * the right, the number the recipient recovers from exactly those bytes.
 *
 * Saying "the amount is hidden" is a claim. Listing what IS there, exhaustively,
 * and then showing the amount coming back out of it, is a demonstration.
 */
export function PaymentAnatomy({ data }: { data: Data }) {
  if (!data.ok || !data.onChain || !data.decrypted) {
    return null;
  }

  return (
    <section>
      <p className="eyebrow">One payment, opened up</p>
      <h2 className="mt-4 text-2xl font-bold tracking-tight">
        Everything the chain records. Look for the amount.
      </h2>
      <p className="mt-3 max-w-2xl text-[0.94rem] leading-relaxed text-ink-soft">
        This is unit 1A&rsquo;s dues: a real transaction, in full. Not a summary of it.
      </p>

      {/* `items-start` matters: the two cards are a pair, not a two-column
          layout. Stretching the right one to the field list's height left a tall
          block of empty colour under a three-word answer — the space read as
          something missing rather than as room. It now ends where it ends, and
          rides along instead, so the recovered amount stays beside whichever
          field the reader is looking at. */}
      <div className="mt-6 grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-rule bg-paper-sunk">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-3">
            <span className="inline-flex items-center gap-1.5 font-mono text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
              <Eye className="size-3" />
              public, anyone can read this
            </span>
            {data.txHash && (
              <a
                href={`${EXPLORER}/${data.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-[0.66rem] text-ink-soft hover:text-accent"
              >
                ledger {data.ledger}
                <ExternalLink className="size-2.5" />
              </a>
            )}
          </div>

          <dl className="divide-y divide-rule">
            {data.onChain.map((f) => (
              <div key={f.name} className="px-5 py-3.5">
                <dt className="flex flex-wrap items-baseline gap-2">
                  <code className="font-mono text-[0.8rem] font-bold text-ink">{f.name}</code>
                  <span className="text-[0.78rem] text-ink-soft">{f.note}</span>
                </dt>
                <dd className="commitment mt-1.5 whitespace-pre-wrap">{f.value}</dd>
              </div>
            ))}
          </dl>

          <p className="border-t border-rule px-5 py-3.5 text-[0.86rem] leading-relaxed text-ink-soft">
            That is the complete record. There is no field holding the amount, because the
            contract was never told it.
          </p>
        </div>

        {/* Same anatomy as the card on the left — header rule, body, divided
            sections — so the two read as a matched pair. The distinction is
            carried by the one number that came back out, not by washing the
            whole panel in a tint. */}
        <div className="overflow-hidden rounded-2xl border border-rule bg-paper lg:sticky lg:top-24">
          <div className="border-b border-rule px-5 py-3">
            <span className="inline-flex items-center gap-1.5 font-mono text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-accent">
              <EyeOff className="size-3" />
              recovered with the viewing key
            </span>
          </div>

          <div className="px-5 py-4">
            <p className="text-[0.86rem] leading-relaxed text-ink-soft">
              The building runs <code className="font-mono text-ink">decryptIncoming</code> over
              the fields on the left. Nothing else: no side channel, no stored note, no
              server.
            </p>

            <p className="mt-4 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
              amount paid
            </p>
            <p className="mt-1 font-mono text-[2rem] font-bold leading-none text-accent">
              {Number(data.decrypted.amount) / XLM} XLM
            </p>
          </div>

          <div className="border-t border-rule bg-paper-sunk px-5 py-4">
            <p className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
              and its blinding factor
            </p>
            <code className="commitment mt-1.5 block">{data.decrypted.blinding}</code>
            <p className="mt-2.5 text-[0.8rem] leading-relaxed text-ink-soft">
              This is the part that matters later: it is what lets the building fold the
              payment into a total it can still open.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
