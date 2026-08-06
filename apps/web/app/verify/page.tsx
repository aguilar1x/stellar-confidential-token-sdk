import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Reveal } from "@/components/reveal";
import { CONTRACTS, RPC_URL, type ArchiveId } from "@/lib/demo";
import { BUILDING } from "@/app/demo/data";
import { auditBuilding } from "@/app/demo/audit";
import { Tamper } from "@/app/demo/tamper";
import { judge, type Verdict } from "./verdicts";
import { VerifyClient } from "./verify-client";
import { ReceiptSlot } from "./receipt-slot";

export const metadata: Metadata = {
  title: "Break the archive",
  description:
    "Change the total by one stroop and watch the commitment refuse it. Then point the client at five archives, three of them lie.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** A transaction hash, as the receipt link carries it. */
const isTxHash = (s: string) => /^[0-9a-f]{64}$/i.test(s);

/**
 * The page a judge decides on.
 *
 * It used to be watch-only: five preset adversaries, five buttons, five
 * verdicts we had arranged in advance. The interactive half — recomputing a
 * commitment from numbers the reader edits — lived on /demo, where it competed
 * with the product. They have swapped. The reader now does arithmetic first
 * against a number they can change, and only then hands the client to archives
 * that lie.
 *
 * If they arrive from a payment, their own receipt goes above both.
 */
export default async function Verify({
  searchParams,
}: {
  searchParams: Promise<{ receipt?: string; amount?: string }>;
}) {
  /**
   * Bind the server action to this request's origin, so the client can trigger
   * a real replay without being handed the ability to point the checker at an
   * arbitrary URL.
   */
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;

  const params = await searchParams;
  const receipt = params.receipt && isTxHash(params.receipt) ? params.receipt : null;
  const amount = params.amount && /^\d{1,20}$/.test(params.amount) ? params.amount : "";

  const audit = await auditBuilding();

  async function run(id: ArchiveId): Promise<Verdict> {
    "use server";
    return judge(id, origin);
  }

  return (
    <main className="mx-auto max-w-4xl px-6 pb-24 pt-32">
      <Reveal>
        <p className="eyebrow">Adversarial</p>
        <h1 className="mt-4 max-w-2xl text-[2.1rem] font-bold leading-[1.1] tracking-tight sm:text-5xl">
          Don&rsquo;t believe any of it.
          <br />
          <span className="text-accent">Try to break it instead.</span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-soft">
          Two attacks, both yours to run. Lie about the total and watch the commitment
          refuse it, computed in your browser, nothing sent anywhere. Then lie to the
          wallet about its own history, and see which archives it believes.
        </p>
      </Reveal>

      {/* If they paid at any point this visit, their own numbers come first —
          whether they arrived straight from the payment or wandered off and
          came back. The slot decides; the server just hands it the live audit
          and whatever the URL carried. */}
      {!audit.error && (
        <ReceiptSlot
          urlTx={receipt}
          urlAmount={amount}
          total={audit.published}
          blinding={audit.blinding}
          onchainCommitment={audit.onchainCommitment}
          contract={CONTRACTS.token}
          account={BUILDING.address}
          rpcUrl={RPC_URL}
        />
      )}

      {/* Attack one: the reader's own arithmetic, against a live number. */}
      {!audit.error && (
        <Reveal delay={0.05}>
          <section className="mt-12 border-t border-rule pt-12">
            <p className="eyebrow">Attack one · the total</p>
            <h2 className="mt-4 text-2xl font-bold tracking-tight">
              Overstate the books by one stroop.
            </h2>
            <p className="mt-3 max-w-2xl text-[0.94rem] leading-relaxed text-ink-soft">
              A ten-millionth of an XLM, the smallest amount that exists. The building&rsquo;s
              real total and blinding are below, read off the chain at this page load.
            </p>
            <div className="mt-8">
              <Tamper
                total={audit.published}
                blinding={audit.blinding}
                onchainCommitment={audit.onchainCommitment}
                contract={CONTRACTS.token}
                account={BUILDING.address}
                rpcUrl={RPC_URL}
              />
            </div>
          </section>
        </Reveal>
      )}

      {/* Attack two: lie to the wallet about its history. */}
      <Reveal delay={0.05}>
        <section className="mt-16 border-t border-rule pt-12">
          <p className="eyebrow">Attack two · the history</p>
          <h2 className="mt-4 text-2xl font-bold tracking-tight">Try to fool the wallet.</h2>
          <p className="mt-3 max-w-2xl text-[0.94rem] leading-relaxed text-ink-soft">
            Reinstalling a wallet means replaying history from an archive it did not write.
            Below, one real account&rsquo;s history is served five ways. Three of the archives
            are dishonest, two of them while insisting their history is complete.
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Nothing here is staged. Each button runs the published client against a live
            endpoint and checks the result against Stellar testnet.
          </p>

          <div className="mt-10 border-t border-rule pt-10">
            <VerifyClient run={run} />
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="mt-14 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-rule bg-paper-sunk p-5">
            <h2 className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-accent">
              C3 · the archive admits it
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              An honest archive with a gap says so, and the client refuses the range before
              replaying a single event. A partial history does not produce a partial balance,
              it produces a confident, wrong one.
            </p>
          </div>
          <div className="rounded-xl border border-rule bg-paper-sunk p-5">
            <h2 className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-refused">
              §7 · the chain settles it
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              A dishonest archive claims completeness, so C3 cannot help, because a flag is only as
              good as whoever asserts it. The client re-derives its openings and checks them
              against the commitments on-chain. One of these is wrong by a single stroop, and
              is refused anyway.
            </p>
          </div>
        </section>
      </Reveal>

      {/* Ends on a move forward. */}
      <Reveal>
        <section className="mt-16 border-t border-rule pt-10">
          <h2 className="text-xl font-bold tracking-tight">
            So what were those archives protecting?
          </h2>
          <p className="mt-3 max-w-xl text-[0.94rem] leading-relaxed text-ink-soft">
            A building collecting its dues. Eight neighbours, eight different amounts, none of
            them on-chain, and a total every resident can audit. That guarantee is what a
            lying archive takes away.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              See the audit
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/how"
              className="inline-flex items-center gap-2 rounded-md border border-rule px-5 py-2.5 text-sm text-ink-soft transition-colors hover:text-ink"
            >
              Why this works
            </Link>
          </div>
        </section>
      </Reveal>
    </main>
  );
}
