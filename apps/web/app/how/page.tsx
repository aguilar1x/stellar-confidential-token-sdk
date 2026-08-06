import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Reveal, StaggerGroup, StaggerItem } from "@/components/reveal";
import { Commitment } from "@/components/commitment";
import { auditBuilding, demonstrateHomomorphism } from "@/app/demo/audit";
import { firstPaymentAnatomy } from "@/app/demo/anatomy";
import { Lifecycle } from "@/app/demo/lifecycle";
import { PaymentAnatomy } from "@/app/demo/anatomy-view";
import LIFECYCLE_TXS from "@/app/demo/lifecycle-txs.json";
import { RepoScript } from "@/components/repo-script";

export const metadata: Metadata = {
  title: "Why this works",
  description:
    "The lifecycle of a confidential payment, everything the chain records for one of them, and the arithmetic that lets a total stay auditable while no line item is written.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * The long half of the demo.
 *
 * /demo used to carry all of this inline, which meant a visitor met Pedersen
 * commitments and a wall of hex BEFORE reaching the button that pays. The page
 * that has to land in thirty seconds cannot also be the page that explains
 * elliptic curves, so the explanation lives here and /demo links to it.
 *
 * Nothing was diluted on the way over: same live audit, same real
 * transactions, same numbers read off the chain at request time.
 */
export default async function How() {
  const [audit, homo, anatomy] = await Promise.all([
    auditBuilding(),
    demonstrateHomomorphism(),
    firstPaymentAnatomy(),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-6 pb-24 pt-32">
      <Reveal>
        <p className="eyebrow">Under the demo</p>
        <h1 className="mt-4 max-w-2xl text-[2.1rem] font-bold leading-[1.1] tracking-tight sm:text-5xl">
          Why a total can be audited
          <br />
          <span className="text-accent">when no amount was written.</span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-soft">
          The demo shows it happening. This page is the part that makes it more than a
          claim: how value gets into the pool, everything the chain stores for one real
          payment, and the arithmetic that folds eight of them into one auditable number.
        </p>
      </Reveal>

      <Reveal delay={0.05}>
        <section className="mt-14 border-t border-rule pt-12">
          <p className="eyebrow">How the money got there</p>
          <h2 className="mt-4 text-2xl font-bold tracking-tight">
            Four steps. Two of them are public, and that is not a bug.
          </h2>
          <p className="mt-3 max-w-2xl text-[0.94rem] leading-relaxed text-ink-soft">
            Getting value into the pool is a boundary crossing, so it is visible by
            construction. What happens inside the pool is not.
          </p>
          <div className="mt-8 border-t border-rule pt-8">
            <Lifecycle txs={LIFECYCLE_TXS} />
          </div>
        </section>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="mt-16 border-t border-rule pt-12">
          <PaymentAnatomy data={anatomy} />
        </div>
      </Reveal>

      {/* The audit in full: the two commitments, byte for byte. /demo states the
          verdict; this is the evidence behind it. */}
      {!audit.error && (
        <Reveal delay={0.05}>
          <section className="mt-16 border-t border-rule pt-12">
            <p className="eyebrow">The audit, in full</p>
            <h2 className="mt-4 text-2xl font-bold tracking-tight">
              Two points that have to be the same point.
            </h2>
            <p className="mt-3 max-w-2xl text-[0.94rem] leading-relaxed text-ink-soft">
              The chain holds one commitment for everything the building received. Opening
              it to the published total and recomputing the commitment gives back the point
              the chain already stores. It could not, had the building overstated or
              understated by a single stroop.
            </p>

            <div className="mt-8 grid gap-4 rounded-xl border border-rule bg-paper p-6 sm:grid-cols-2">
              <Commitment
                label="commitment on-chain"
                hex={audit.onchainCommitment}
                tone={audit.ok ? "verified" : "refused"}
              />
              <Commitment
                label="recomputed from the total"
                hex={audit.recomputedCommitment}
                tone={audit.ok ? "verified" : "refused"}
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-soft">
              Both read at request time. You can redo this opening yourself, in your own
              browser, on{" "}
              <Link href="/verify" className="text-accent hover:underline">
                the page that lets you change the numbers
              </Link>
              .
            </p>
          </section>
        </Reveal>
      )}

      {/**
       * The bug, directly after the audit that produced it.
       *
       * It was last on the page and set one type size below every other
       * heading, with a shell command as the final word, the exact footnote
       * treatment it had been promoted out of once already. It is the strongest
       * claim on the site: the demo caught a defect a test suite had not, in
       * code that had already shipped. So it sits where the red came from, at
       * the same weight as its neighbours, and the eight transactions are
       * evidence inside the argument rather than a disclaimer under it.
       */}
      {!audit.error && (
        <Reveal delay={0.05}>
          <section className="mt-16 border-t border-rule pt-12">
            <p className="eyebrow">What it cost to find out</p>
            <h2 className="mt-4 text-2xl font-bold tracking-tight">
              The first time those two points disagreed, we were the ones who were wrong.
            </h2>
            <p className="mt-4 max-w-2xl text-[0.94rem] leading-relaxed text-ink-soft">
              This audit came out red. The total was right and the commitment was wrong,
              because the client was adding blinding factors in the wrong field. With a
              single payment that reconstructs correctly either way, so it took eight
              neighbours to show up.
            </p>
            <p className="mt-3 max-w-2xl text-[0.94rem] leading-relaxed text-ink-soft">
              Every example shipped before this one moved money exactly once, which is why
              nothing had caught it. Not the test suite, not a passing proof. The
              eight transactions above are on testnet and regenerable from a clone by{" "}
              <RepoScript path="examples/condominium.mjs" />, and running them is what turned a
              passing client into a failing one.
            </p>
            <p className="mt-3 max-w-2xl text-[0.94rem] leading-relaxed text-ink-soft">
              That is the argument for a demo with real numbers in it rather than a test suite
              alone, and it is the first of{" "}
              <Link href="/#defects" className="text-accent hover:underline">
                three defects
              </Link>{" "}
              this work turned up.
            </p>
          </section>
        </Reveal>
      )}

      {/* Why it works, shown rather than asserted. */}
      <StaggerGroup className="mt-16 border-t border-rule pt-12">
        <StaggerItem>
          <p className="eyebrow">Why this is possible</p>
          <h2 className="mt-4 text-2xl font-bold tracking-tight">Commitments add.</h2>
        </StaggerItem>

        <StaggerItem>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-soft">
            A commitment to a value <code className="text-ink">v</code> with blinding{" "}
            <code className="text-ink">r</code> is the curve point{" "}
            <code className="text-ink">v·G + r·H</code>. Add two and you get{" "}
            <code className="text-ink">(v₁+v₂)·G + (r₁+r₂)·H</code>, a commitment to the
            sum, containing nothing that identifies either term. So eight payments land in the
            building&rsquo;s balance and the chain ends up holding a commitment to their total
            without ever having held one to any single payment.
          </p>
        </StaggerItem>

        <StaggerItem>
          <div
            className={`mt-6 rounded-xl border bg-paper p-5 ${
              homo.matches ? "border-verified/30" : "border-refused/30"
            }`}
          >
            <p className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
              split the total two ways, commit to each half, add the points
            </p>
            <div className="mt-3 space-y-1.5">
              <Commitment hex={homo.a} truncate={40} />
              <Commitment hex={homo.b} truncate={40} />
            </div>
            <p className="mt-4 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
              equals a commitment to the whole
            </p>
            <div className="mt-2">
              <Commitment
                hex={homo.sum}
                truncate={40}
                tone={homo.matches ? "verified" : "refused"}
              />
            </div>
            <p
              className={`mt-4 font-mono text-xs font-bold ${
                homo.matches ? "text-verified" : "text-refused"
              }`}
            >
              {homo.matches ? "✓ identical" : "✗ mismatch"}
            </p>
          </div>
        </StaggerItem>

        <StaggerItem>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-ink-soft">
            A plain ledger makes you choose between an auditable total and private line items.
            This does not, but only while the history the wallet replays is the real one.
          </p>
        </StaggerItem>
      </StaggerGroup>


      <Reveal>
        <section className="mt-16 flex flex-wrap gap-3 border-t border-rule pt-10">
          <Link
            href="/verify"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Try to break it
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-md border border-rule px-5 py-2.5 text-sm text-ink-soft transition-colors hover:text-ink"
          >
            Integrate the SDK
          </Link>
        </section>
      </Reveal>
    </main>
  );
}
