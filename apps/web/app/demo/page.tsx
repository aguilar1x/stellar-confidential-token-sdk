import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, ShieldAlert, ExternalLink } from "lucide-react";

import { Reveal, StaggerGroup, StaggerItem } from "@/components/reveal";
import { Commitment } from "@/components/commitment";
import { EXPLORER } from "@/lib/demo";
import { BUILDING } from "./data";
import { auditBuilding, demonstrateHomomorphism } from "./audit";
import { firstPaymentAnatomy } from "./anatomy";
import { Lifecycle } from "./lifecycle";
import { PaymentAnatomy } from "./anatomy-view";
import LIFECYCLE_TXS from "./lifecycle-txs.json";
import { payDues } from "./pay";
import { PayButton } from "./pay-button";

export const metadata: Metadata = {
  title: "A building collects its dues",
  description:
    "Eight units pay different amounts, none of them on-chain, and every resident can still audit the total.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const XLM = 10_000_000n;
const xlm = (s: string | bigint) =>
  `${(Number(BigInt(s)) / Number(XLM)).toLocaleString("en-US")} XLM`;

export default async function Demo() {
  const [audit, homo, anatomy] = await Promise.all([
    auditBuilding(),
    demonstrateHomomorphism(),
    firstPaymentAnatomy(),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-6 pb-24 pt-32">
      <Reveal>
        <p className="eyebrow">A month of dues · Stellar testnet</p>
        <h1 className="mt-4 max-w-2xl text-[2.1rem] font-bold leading-[1.1] tracking-tight sm:text-5xl">
          Everyone audits the total.
          <br />
          <span className="text-accent">Nobody sees your payment.</span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-soft">
          Eight units paid this month. A studio does not pay what the penthouse pays, and none
          of those amounts exist on-chain. Yet any resident can check that the building
          collected exactly what it says it did — not by trusting the treasurer, and not by
          being shown the ledger.
        </p>
      </Reveal>

      <Reveal delay={0.05}>
        <section className="mt-12 border-t border-rule pt-12">
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

      {/* The ledger. The point of this table is the column that has nothing in it. */}
      <Reveal delay={0.08}>
        <section className="mt-12 overflow-hidden rounded-xl border border-rule bg-paper">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule">
                {["Unit", "Type", "Paid", "On-chain"].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-3 text-left font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-ink-soft"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {BUILDING.units.map((u) => (
                <tr key={u.id}>
                  <td className="px-5 py-3 font-semibold">{u.id}</td>
                  <td className="px-5 py-3 text-ink-soft">{u.label}</td>
                  <td className="px-5 py-3">
                    <span className="font-mono text-sealed">
                      <span aria-hidden className="mr-1.5 opacity-50 tracking-[0.1em]">
                        ••••
                      </span>
                      sealed
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {u.tx ? (
                      <a
                        href={`${EXPLORER}/${u.tx}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-xs text-ink-soft hover:text-accent"
                      >
                        {u.tx.slice(0, 10)}…
                        <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <span className="text-ink-soft">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-rule bg-paper-sunk">
                <td colSpan={2} className="px-5 py-4">
                  <span className="font-semibold">Collected this month</span>
                  {BigInt(audit.published) > BigInt(audit.fromUnits) && (
                    <span className="ml-2 text-sm text-ink-soft">
                      — {xlm(audit.fromUnits)} from the eight units,{" "}
                      {xlm((BigInt(audit.published) - BigInt(audit.fromUnits)).toString())}{" "}
                      added by visitors
                    </span>
                  )}
                </td>
                <td colSpan={2} className="px-5 py-4 text-right font-mono text-lg font-bold text-accent">
                  {xlm(audit.published)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">
          &ldquo;Sealed&rdquo; is not a display choice. Those amounts are published nowhere —
          each is inside a commitment only the payer and the building can open.
        </p>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="mt-14">
          <PaymentAnatomy data={anatomy} />
        </div>
      </Reveal>

      {/* The audit. */}
      <Reveal delay={0.05}>
        <section
          className={`mt-10 rounded-xl border bg-paper p-6 ${
            audit.ok ? "border-verified/40" : "border-refused/40"
          }`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[0.62rem] font-bold uppercase tracking-[0.12em] ${
                audit.ok ? "bg-emerald-50 text-verified" : "bg-red-50 text-refused"
              }`}
            >
              {audit.ok ? <ShieldCheck className="size-3" /> : <ShieldAlert className="size-3" />}
              {audit.ok ? "verified" : "mismatch"}
            </span>
            <h2 className="text-lg font-semibold">The audit</h2>
          </div>

          {audit.error ? (
            <p className="mt-4 text-sm text-refused">{audit.error}</p>
          ) : (
            <>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-soft">
                The chain holds one commitment for everything the building received. Opening it
                to the published total and recomputing the commitment gives back the point the
                chain already stores — which it could not, had the building overstated or
                understated by a single stroop.
              </p>

              <dl className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  <dt className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                    The building publishes
                  </dt>
                  <dd className="mt-1.5 font-mono text-base font-semibold">
                    {xlm(audit.published)}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                    The chain&rsquo;s commitment opens to
                  </dt>
                  <dd
                    className={`mt-1.5 font-mono text-base font-semibold ${
                      audit.ok ? "text-verified" : "text-refused"
                    }`}
                  >
                    {xlm(audit.reconstructed)}
                  </dd>
                </div>
              </dl>

              <div className="mt-6 grid gap-4 border-t border-rule pt-5 sm:grid-cols-2">
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
            </>
          )}
        </section>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="mt-6">
          <PayButton pay={payDues} />
        </div>
      </Reveal>

      {/* Why it works — shown, not asserted. */}
      <StaggerGroup className="mt-14">
        <StaggerItem>
          <p className="eyebrow">Why this is possible</p>
          <h2 className="mt-4 text-2xl font-bold tracking-tight">Commitments add.</h2>
        </StaggerItem>

        <StaggerItem>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-soft">
            A commitment to a value <code className="text-ink">v</code> with blinding{" "}
            <code className="text-ink">r</code> is the curve point{" "}
            <code className="text-ink">v·G + r·H</code>. Add two and you get{" "}
            <code className="text-ink">(v₁+v₂)·G + (r₁+r₂)·H</code> — a commitment to the
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
            This does not — but only while the history the wallet replays is the real one.{" "}
            <Link href="/verify" className="text-accent hover:underline">
              So try breaking the archive that serves it.
            </Link>
          </p>
        </StaggerItem>
      </StaggerGroup>

      <Reveal>
        <p className="mt-12 text-xs leading-relaxed text-ink-soft">
          Eight real transactions on Stellar testnet. Reproduce them with{" "}
          <code className="rounded border border-rule bg-paper-sunk px-1.5 py-0.5 font-mono">
            node examples/condominium.mjs
          </code>
          . Building this is what surfaced the blinding-accumulation bug listed on the home
          page — a single payment reconstructs correctly under either modulus, so it took eight
          to show up.
        </p>
      </Reveal>
    </main>
  );
}
