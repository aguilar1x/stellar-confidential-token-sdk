import type { Metadata } from "next";
import { ShieldCheck, ShieldAlert, ArrowRight } from "lucide-react";

import { Reveal } from "@/components/reveal";
import { BUILDING } from "./data";
import { auditBuilding, type AuditResult } from "./audit";
import { PayButton } from "./pay-button";
import { Steps } from "./steps";
import { RepoScript } from "@/components/repo-script";
import { StepLink } from "./step-actions";
import { LedgerTable } from "./ledger-table";

export const metadata: Metadata = {
  title: "A building collects its dues",
  description:
    "Eight units pay different amounts, none of them on-chain, and every resident can still audit the total.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const XLM = 10_000_000n;

/**
 * Stroops to XLM, exactly.
 *
 * The obvious `Number(s) / 1e7` with `toLocaleString` rounds to three decimals,
 * which is precisely the digit this page argues about: the sabotage tab moves a
 * balance by ONE stroop, and a reader who watches the displayed number not
 * change concludes the tamper check is theatre. Integer arithmetic on the
 * bigint, with trailing zeros trimmed. Never a float, so 8 decimals survive.
 */
const xlm = (s: string | bigint) => {
  const v = BigInt(s);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = (abs / XLM).toLocaleString("en-US");
  const frac = (abs % XLM).toString().padStart(7, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""} XLM`;
};

/**
 * Three tabs, in the order a visitor does them: read the sealed ledger, pay
 * into it, check the result themselves.
 *
 * This page used to also carry the payment anatomy, the raw commitment hex, the
 * Pedersen identity and the tamper console: eight sections, with the button
 * that pays sitting sixth. A judge with four minutes met elliptic curves before
 * they met the product. All of that still exists and none of it was softened;
 * the explanation moved to /how and the adversarial console to /verify, which
 * is the page named after it.
 *
 * What is left is the claim, the act, and the check, as tabs rather than
 * scroll, so all three are visible as a set from the first screen instead of
 * being discovered on the way down.
 */
export default async function Demo() {
  const audit = await auditBuilding();

  return (
    <main className="mx-auto max-w-3xl px-6 pb-24 pt-32">
      <Reveal>
        <p className="eyebrow">A month of dues · Stellar testnet</p>
        <h1 className="mt-4 max-w-2xl text-[2.1rem] font-bold leading-[1.1] tracking-tight sm:text-5xl">
          Everyone audits the total.
          <br />
          <span className="text-accent">Nobody sees your payment.</span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-soft">
          Eight units paid this month. A studio does not pay what the penthouse pays, and
          none of those amounts exist on-chain, yet anyone can check the building collected
          exactly what it says it did. Three steps, about a minute, no wallet.
        </p>
      </Reveal>

      <Reveal delay={0.05}>
        <Steps
          steps={[
            {
              id: "ledger",
              title: "Read the ledger",
              blurb:
                "Every row is a real transaction on testnet. Every amount is sealed: published nowhere, held only inside a commitment the payer and the building can open. Open one on the explorer and look for the amount.",
              content: <Ledger audit={audit} />,
            },
            {
              id: "pay",
              title: "Add a payment",
              blurb:
                "Pick any amount. It becomes a real transaction on Stellar testnet: the total moves, your amount is written nowhere, and the audit still opens.",
              content: (
                <>
                  <PayButton />
                  <WhoseKey />
                </>
              ),
            },
            {
              id: "check",
              title: "Check it yourself",
              blurb:
                "Everything so far is something we did and are reporting. The next page is yours: it recomputes the commitment in your own browser from numbers you can edit, and points the client at five archives, three of which lie about this account's history.",
              content: (
                <div className="flex flex-wrap gap-3">
                  <StepLink href="/verify">
                    Try to break it
                    <ArrowRight className="size-4" />
                  </StepLink>
                  <StepLink href="/how" variant="secondary">
                    Why this works
                  </StepLink>
                </div>
              ),
            },
          ]}
        />
      </Reveal>

      <Reveal>
        <p className="mt-16 border-t border-rule pt-8 text-xs leading-relaxed text-ink-soft">
          Eight real transactions on Stellar testnet, regenerated from a clone of the
          repository by <RepoScript path="examples/condominium.mjs" />, a fixture script, not
          part of the published package. Testnet only, not audited.
        </p>
      </Reveal>
    </main>
  );
}

/**
 * Whose key signs.
 *
 * A reader watching a "Pay" button on a page about confidential money forms one
 * objection, in this order: whose money is that? Answering it beside the button
 * costs a sentence. It was a clause at the foot of the page before, past the
 * point most readers stop, and phrased as why we did not add wallet-connect,
 * which is an excuse where a fact belongs.
 *
 * So: state it plainly, and hand over the path that does use their own key,
 * because that path is real and shipped.
 */
function WhoseKey() {
  return (
    <p className="mt-4 text-xs leading-relaxed text-ink-soft">
      <strong className="font-semibold text-ink">The key that signs is ours, not yours.</strong>{" "}
      This pays from a guest key held on the server, published in the repository on purpose.
      The transaction and the proof are real, the money is not yours. Paying confidentially
      requires an account already registered, funded and merged, so a freshly connected wallet
      could not do it in one click anyway. To run the whole thing from a key you generate,{" "}
      <RepoScript path="examples/live-payment.mjs" /> in the repository funds a new keypair
      with friendbot and does every step from scratch.
    </p>
  );
}

/**
 * The sealed table and the one-sentence verdict.
 *
 * The point of the table is the column that has nothing in it. The verdict is a
 * sentence rather than the two commitment points it rests on, because a reader
 * who wants to see those bytes has a page for it, and a reader who does not
 * should still leave knowing what was checked.
 */
function Ledger({ audit }: { audit: AuditResult }) {
  return (
    <>
      {/* The fixture's units are known at build time; the reader's own payments
          are not, so the table itself is a client component that folds them in
          after mount. Only what it needs crosses the boundary: no `dues`,
          which is sealed and has no business in a browser bundle. */}
      <LedgerTable
        units={BUILDING.units.map((u) => ({ id: u.id, label: u.label, tx: u.tx ?? null }))}
        published={audit.published}
        fromUnits={audit.fromUnits}
      />

      {/* Marked with a rule, not a wash, the same device as the notes in the docs.
          The verdict is carried by the badge and the sentence; a green
          rectangle behind them only makes both harder to read. */}
      <div
        className={`mt-4 flex flex-wrap items-center gap-3 rounded-r-xl border-y border-r border-rule border-l-2 bg-paper-sunk px-5 py-4 ${
          !audit.error && audit.ok ? "border-l-verified" : "border-l-refused"
        }`}
      >
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-md bg-paper px-2.5 py-1 font-mono text-[0.62rem] font-bold uppercase tracking-[0.12em] ${
            audit.ok && !audit.error ? "text-verified" : "text-refused"
          }`}
        >
          {audit.ok && !audit.error ? (
            <ShieldCheck className="size-3" />
          ) : (
            <ShieldAlert className="size-3" />
          )}
          {audit.error ? "unavailable" : audit.ok ? "verified" : "mismatch"}
        </span>
        <p className="min-w-0 flex-1 text-sm leading-relaxed">
          {audit.error ? (
            <span className="text-refused">{audit.error}</span>
          ) : audit.ok ? (
            <>
              The commitment the chain is holding opens to exactly{" "}
              <strong className="font-semibold">{xlm(audit.published)}</strong>. It could not,
              had the building overstated or understated by a single stroop.
            </>
          ) : (
            <span className="text-refused">
              The chain&rsquo;s commitment does not open to the published total.
            </span>
          )}
        </p>
      </div>
    </>
  );
}
