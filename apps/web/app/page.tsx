import Link from "next/link";
import { ArrowRight, ShieldCheck, ShieldAlert, Github, Package } from "lucide-react";

import { Reveal, StaggerGroup, StaggerItem } from "@/components/reveal";
import { HexField } from "@/components/hex-field";
import { HeroBackdrop } from "@/components/hero-backdrop";
import { heroCommitment } from "./hero-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FINDINGS = [
  {
    title: "Blindings summed in the wrong field",
    body: "A wallet that received two payments reconstructed an opening its own on-chain commitment rejects. One payment works under either modulus, so nothing caught it until a building collected eight.",
    where: "found by the demo",
  },
  {
    title: "An ephemeral scalar nothing constrains",
    body: "r_e was derived under the wrong domain tag. No circuit constrains it, so every proof still verified. The damage only shows when a second client cannot recompute it and the transfer stops being disclosable.",
    where: "found by the conformance suite",
  },
  {
    title: "Fixtures the specification asks for, that nobody published",
    body: "SDK.md §6.3 names three derivations needing cross-language coverage. One existed. The other two are generated here, in OpenZeppelin's own testdata format.",
    where: "a gap, not a bug",
  },
];

export default async function Landing() {
  const hero = await heroCommitment();

  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative isolate flex min-h-svh items-center overflow-hidden bg-ink">
        <HeroBackdrop />
        <HexField seed={hero.commitment} />

        <div className="relative mx-auto w-full max-w-6xl px-6 pb-20 pt-28 sm:pb-24 sm:pt-32">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
            {/* Left: the claim. */}
            <div>
              <Reveal>
                <p className="font-mono text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-white/50">
                  OpenZeppelin Confidential Tokens · Stellar
                </p>
                <h1 className="mt-5 text-[2.3rem] font-bold leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl lg:text-[3.4rem]">
                  An amount nobody can read.
                  <br />
                  {/* The second line carries the colour, because it is the half of
                      the claim that is unusual. Anyone can hide a number; the
                      argument this project makes is that the total stays auditable
                      while it is hidden. */}
                  <span className="text-accent-lift">A total everybody can audit.</span>
                </h1>
                <p className="mt-6 max-w-lg text-[0.98rem] leading-relaxed text-white/70">
                  Three things have to hold: keys that derive identically on every
                  device, balances rebuilt from an archive you did not write, and proofs
                  the chain accepts. All three fail silently, as money that will not move.
                  This ships all three, and times every stage in front of you.
                </p>
              </Reveal>

              <Reveal delay={0.12}>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link
                    href="/demo"
                    className="btn-raised-light group inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-ink"
                  >
                    See it audited
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <Link
                    href="/verify"
                    className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
                  >
                    Break the archive
                  </Link>
                </div>
              </Reveal>
            </div>

            {/* Right: the claim, checked. Beside the headline rather than under
                it, so the evidence and the assertion are read together.

                The card deliberately has NO entrance animation. Its blur is a
                backdrop-filter, and an ancestor animating opacity or transform
                establishes a new backdrop root, so during a reveal the filter
                has no page behind it to sample and renders as nothing, then
                snaps back when the animation settles. Do not wrap this in
                Reveal; the credit below it can animate because it has no
                filter of its own.

                Shifted right with padding and a negative margin rather than a
                translate, for the same reason: a transform on an ancestor
                establishes a backdrop root too, static or not, and the card
                would lose the page it is sampling. */}
            <div className="lg:-mr-4 lg:pl-20">
              <figure className="rounded-2xl border border-white/12 bg-white/[0.07] p-6 backdrop-blur-md">
                <figcaption className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-white/45">
                    a real balance, on testnet
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 font-mono text-[0.66rem] font-semibold ${
                      hero.verified ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    {hero.verified ? (
                      <ShieldCheck className="size-3.5" />
                    ) : (
                      <ShieldAlert className="size-3.5" />
                    )}
                    {hero.verified ? "verified against chain" : "chain unreachable"}
                  </span>
                </figcaption>

                <div className="mt-5 border-t border-white/10 pt-5">
                  <p className="text-[0.68rem] uppercase tracking-wider text-white/45">
                    What the chain reveals
                  </p>
                  <p className="mt-1.5 font-mono text-2xl text-white/30">
                    <span aria-hidden>•••• ••••</span>
                    <span className="sr-only">nothing</span>
                  </p>
                </div>

                <div className="mt-5 border-t border-white/10 pt-5">
                  <p className="text-[0.68rem] uppercase tracking-wider text-white/45">
                    What the opening proves
                  </p>
                  <p className="mt-1.5 font-mono text-3xl font-bold text-white">
                    {hero.verified ? hero.total : "not read"}
                  </p>
                </div>
              </figure>

              <Reveal delay={0.18} className="mt-7 flex items-center justify-end gap-3.5">
                <span className="text-[0.82rem] text-white/50">Built by</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logos/oppia.svg"
                  alt="Oppia Labs"
                  className="h-8 w-auto brightness-0 invert"
                />
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ── The two guarantees ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <Reveal>
          <p className="eyebrow">Two guarantees, and they need each other</p>
          <h2 className="mt-5 max-w-2xl text-[1.7rem] font-bold leading-tight tracking-[-0.02em] sm:text-4xl">
            Privacy is worthless if the balance is wrong. Correctness is worthless if it costs
            you privacy.
          </h2>
        </Reveal>

        <StaggerGroup className="mt-12 grid gap-5 sm:grid-cols-2">
          <StaggerItem>
            <Link
              href="/demo"
              className="group flex h-full flex-col rounded-2xl border border-rule bg-paper p-7 transition-all hover:border-accent/40 hover:shadow-[0_16px_40px_-24px_rgb(16_18_38_/_0.35)]"
            >
              <span className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-accent">
                the guarantee
              </span>
              <h3 className="mt-4 text-xl font-bold tracking-tight">
                Eight neighbours, eight amounts, one auditable total
              </h3>
              <p className="mt-3 flex-1 text-[0.94rem] leading-relaxed text-ink-soft">
                Commitments add. Each payment contributes to the building&rsquo;s balance
                without the chain ever holding a commitment to a single one of them. The
                treasurer opens the total; no line item is ever written.
              </p>
              <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent">
                See the audit
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </StaggerItem>

          <StaggerItem>
            <Link
              href="/verify"
              className="group flex h-full flex-col rounded-2xl border border-rule bg-paper p-7 transition-all hover:border-refused/40 hover:shadow-[0_16px_40px_-24px_rgb(16_18_38_/_0.35)]"
            >
              <span className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-refused">
                what breaks it
              </span>
              <h3 className="mt-4 text-xl font-bold tracking-tight">
                Only if the history you replay is the real one
              </h3>
              <p className="mt-3 flex-1 text-[0.94rem] leading-relaxed text-ink-soft">
                Rebuilding a wallet means replaying events from an archive it did not write.
                Corrupt one yourself and watch the client refuse it, including the archives
                that claim to be complete while quietly dropping an event.
              </p>
              <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-refused">
                Try to fool it
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </StaggerItem>
        </StaggerGroup>
      </section>

      {/* ── Findings ─────────────────────────────────────────────────────── */}
      {/* `scroll-mt` keeps the heading clear of the fixed nav pill when /how
          links straight here. */}
      <section id="defects" className="scroll-mt-24 border-y border-rule bg-paper-sunk">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <Reveal>
            <p className="eyebrow">What conformance actually caught</p>
            <h2 className="mt-5 max-w-2xl text-[1.7rem] font-bold leading-tight tracking-[-0.02em] sm:text-4xl">
              Three defects, every one ours, every one silent until real money moved.
            </h2>
            <p className="mt-5 max-w-xl text-[0.94rem] leading-relaxed text-ink-soft">
              None of these throw. Each produces a wallet that looks fine and is wrong, which
              is the whole reason OpenZeppelin wrote the obligations down.
            </p>
          </Reveal>

          <StaggerGroup className="mt-12 border-t border-rule-strong">
            {FINDINGS.map((f) => (
              <StaggerItem key={f.title}>
                <div className="grid gap-3 border-b border-rule py-6 sm:grid-cols-[1fr_1.5fr] sm:gap-10">
                  <div>
                    <h3 className="font-semibold leading-snug">{f.title}</h3>
                    <span className="mt-2 block font-mono text-[0.6rem] uppercase tracking-[0.14em] text-sealed">
                      {f.where}
                    </span>
                  </div>
                  <p className="text-[0.94rem] leading-relaxed text-ink-soft">{f.body}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* ── Install ──────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <Reveal>
            <p className="eyebrow">Use it</p>
            <h2 className="mt-5 text-[1.7rem] font-bold leading-tight tracking-[-0.02em] sm:text-4xl">
              The secret is derived, never stored.
            </h2>
            <p className="mt-5 text-[0.94rem] leading-relaxed text-ink-soft">
              Same signer, same key, on any device, forever. That is what makes an account
              recoverable, and it is the obligation §5.1 exists to make enforceable.
            </p>
            <code className="mt-7 inline-block rounded-lg border border-rule bg-paper-sunk px-4 py-2.5 font-mono text-[0.82rem]">
              npm i stellar-confidential-token-sdk
            </code>
            <div>
              <Link
                href="/docs"
                className="mt-7 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
              >
                Read the docs
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <pre className="overflow-x-auto rounded-2xl bg-code p-6 font-mono text-[0.78rem] leading-relaxed text-white/85">
              <code>
                {/* Lifted off /40, which lands at about 3.6:1 on this surface,
                    under the 4.5:1 that small text needs to be legible to
                    everyone. /55 clears it and still reads as subordinate. */}
                <span className="text-white/55">
                  {"// The account secret comes from a signature, not from disk."}
                </span>
                {"\n"}
                <span className="text-indigo-300">const</span> root ={" "}
                <span className="text-indigo-300">await</span> wallet.signMessage({"\n  "}
                skSigningMessage(CONTRACT, ACCOUNT),{"\n"});{"\n"}
                <span className="text-indigo-300">const</span> {"{ sk, addrF }"} ={" "}
                deriveSk(root, CONTRACT, ACCOUNT);{"\n\n"}
                <span className="text-indigo-300">const</span> {"{ payload, next }"} ={" "}
                <span className="text-indigo-300">await</span> proveTransfer({"{"}
                {"\n  "}keys: deriveKeys(sk, addrF),{"\n  "}v: spendable.v, r: spendable.r,
                {"\n  "}amount: <span className="text-emerald-300">750n</span>,{"\n  "}pvkB:
                recipientViewingKey,{"\n"}
                {"}"});{"\n\n"}
                <span className="text-white/40">
                  {"// Persist `next` BEFORE submitting. It is the only"}
                </span>
                {"\n"}
                <span className="text-white/40">
                  {"// thing that can ever spend the result."}
                </span>
              </code>
            </pre>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-10 text-sm text-ink-soft">
          <p className="max-w-lg">
            Apache-2.0 · testnet only, not audited · an independent implementation, not
            endorsed by OpenZeppelin
          </p>
          <div className="flex gap-5">
            <a
              className="inline-flex items-center gap-1.5 transition-colors hover:text-ink"
              href="https://github.com/aguilar1x/stellar-confidential-token-sdk"
            >
              <Github className="size-4" />
              GitHub
            </a>
            <a
              className="inline-flex items-center gap-1.5 transition-colors hover:text-ink"
              href="https://www.npmjs.com/package/stellar-confidential-token-sdk"
            >
              <Package className="size-4" />
              npm
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
