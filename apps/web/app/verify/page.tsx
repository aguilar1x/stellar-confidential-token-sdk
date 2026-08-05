import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { Reveal } from "@/components/reveal";
import type { ArchiveId } from "@/lib/demo";
import { judge, type Verdict } from "./verdicts";
import { VerifyClient } from "./verify-client";

export const metadata: Metadata = {
  title: "Break the archive",
  description:
    "Five archives serve one account's history. Three of them lie. Run the client against each and see which it believes.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Verify() {
  /**
   * Bind the server action to this request's origin, so the client can trigger
   * a real replay without being handed the ability to point the checker at an
   * arbitrary URL.
   */
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;

  async function run(id: ArchiveId): Promise<Verdict> {
    "use server";
    return judge(id, origin);
  }

  return (
    <main className="mx-auto max-w-4xl px-6 pb-24 pt-32">
      <Reveal>
        <p className="eyebrow">Adversarial</p>
        <h1 className="mt-4 max-w-2xl text-[2.1rem] font-bold leading-[1.1] tracking-tight sm:text-5xl">
          Try to fool the wallet.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-soft">
          Reinstalling a wallet means replaying history from an archive it did not write.
          Below, one real account&rsquo;s history is served five ways. Three of the archives
          are dishonest — two of them while insisting their history is complete.
        </p>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">
          Nothing here is staged. Each button runs the published client against a live
          endpoint and checks the result against Stellar testnet.
        </p>
      </Reveal>

      {/* Rules off the page header from the adversarial run, the same way the
          docs header is separated from its body. */}
      <div className="mt-12 border-t border-rule pt-12">
        <VerifyClient run={run} />
      </div>

      <Reveal>
        <section className="mt-14 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-rule bg-paper-sunk p-5">
            <h2 className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-accent">
              C3 · the archive admits it
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              An honest archive with a gap says so, and the client refuses the range before
              replaying a single event. A partial history does not produce a partial balance —
              it produces a confident, wrong one.
            </p>
          </div>
          <div className="rounded-xl border border-rule bg-paper-sunk p-5">
            <h2 className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-refused">
              §7 · the chain settles it
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              A dishonest archive claims completeness, so C3 cannot help — a flag is only as
              good as whoever asserts it. The client re-derives its openings and checks them
              against the commitments on-chain. One of these is wrong by a single stroop, and
              is refused anyway.
            </p>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <p className="mt-10 text-sm leading-relaxed text-ink-soft">
          The archives are the same handler this project deploys for real, differing only in
          how they serve the history.{" "}
          <Link href="/demo" className="text-accent hover:underline">
            See what they were serving
          </Link>
          , or run{" "}
          <code className="rounded border border-rule bg-paper-sunk px-1.5 py-0.5 font-mono text-xs">
            node examples/sabotage.mjs
          </code>{" "}
          for the same thing in a terminal.
        </p>
      </Reveal>
    </main>
  );
}
