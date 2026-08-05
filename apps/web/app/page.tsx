import Link from "next/link";
import { ArrowRight, ShieldCheck, ShieldAlert } from "lucide-react";

import { Reveal, StaggerGroup, StaggerItem } from "@/components/reveal";
import { Commitment } from "@/components/commitment";
import { heroCommitment } from "./hero-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FINDINGS = [
  {
    title: "Blindings summed in the wrong field",
    body: "A wallet that received two payments reconstructed an opening its own on-chain commitment rejects. One payment works under either modulus, so nothing caught it until a building collected eight.",
    where: "found by the demo below",
  },
  {
    title: "Account secrets drawn at random",
    body: "§5.1 requires deriving them from a signer root. Drawn randomly, a clean device can never rebuild the account — the exact failure audit finding N-08 describes.",
    where: "found in the reference core",
  },
  {
    title: "Rejection sampling cleared 8 bits, not 2",
    body: "Rejection became impossible and the counter never advanced, so two conformant clients derive different keys from the same seed.",
    where: "found in the reference core",
  },
  {
    title: "Proof payloads the contract refuses",
    body: "The published prove* functions double-wrapped their envelope. It only fails against a live node, after the proof is generated, so it reads like a proving bug.",
    where: "found in the reference core",
  },
  {
    title: "Deployed circuits predate the spec",
    body: "Two primitives diverge from OpenZeppelin's own fixtures, and both spec changes were security fixes — an ECDH secret invariant under point negation, and a pad that could collide with an amount pad.",
    where: "found by the conformance suite",
  },
];

export default async function Landing() {
  const hero = await heroCommitment();

  return (
    <main>
      <section className="relative overflow-hidden border-b border-hairline/60">
        <div aria-hidden className="grid-backdrop absolute inset-0 opacity-[0.55]" />

        <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-20 sm:pt-28">
          <Reveal>
            <p className="eyebrow">OpenZeppelin Confidential Tokens · Stellar</p>
            <h1 className="mt-5 max-w-3xl text-[2.5rem] font-bold leading-[1.06] tracking-tight sm:text-6xl">
              An amount nobody can read.
              <br />
              <span className="text-accent">A total everybody can audit.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              The chain stores commitments; only your wallet holds the openings that spend
              them. This is the client that derives those openings correctly — and refuses an
              archive that lies about them.
            </p>
          </Reveal>

          {/* The thesis as an object rather than a claim: a real balance on
              testnet. The hex discloses nothing; the verdict beside it was
              computed against the chain just now. */}
          <Reveal delay={0.1}>
            <figure className="mt-12 max-w-2xl rounded-xl border border-hairline bg-surface/80 p-5 backdrop-blur-sm sm:p-6">
              <figcaption className="mb-4 flex items-baseline justify-between gap-4">
                <span className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted">
                  a real balance, on testnet
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 font-mono text-[0.68rem] font-semibold ${
                    hero.verified ? "text-verified" : "text-refused"
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

              <Commitment hex={hero.commitment} />

              <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-hairline pt-4 text-sm">
                <div>
                  <dt className="text-[0.7rem] uppercase tracking-wider text-muted">
                    What the chain reveals
                  </dt>
                  <dd className="mt-1 font-mono text-sealed">
                    <span aria-hidden>•••• ••••</span>
                    <span className="sr-only">nothing</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.7rem] uppercase tracking-wider text-muted">
                    What the opening proves
                  </dt>
                  <dd className="mt-1 font-mono font-semibold text-foreground">
                    {hero.verified ? hero.total : "—"}
                  </dd>
                </div>
              </dl>
            </figure>
          </Reveal>

          <Reveal delay={0.16}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/demo"
                className="group inline-flex items-center gap-2 rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
              >
                See it audited
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/verify"
                className="inline-flex items-center gap-2 rounded-md border border-hairline px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-refused/50 hover:text-refused"
              >
                Break the archive
              </Link>
              <code className="ml-1 rounded-md border border-hairline bg-surface px-3.5 py-2.5 font-mono text-xs text-muted">
                npm i stellar-confidential-token-sdk
              </code>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <Reveal>
          <p className="eyebrow">Two guarantees, and they depend on each other</p>
          <h2 className="mt-4 max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
            Privacy is worthless if the balance is wrong. Correctness is worthless if it
            costs you privacy.
          </h2>
        </Reveal>

        <StaggerGroup className="mt-10 grid gap-4 sm:grid-cols-2">
          <StaggerItem>
            <Link
              href="/demo"
              className="group flex h-full flex-col rounded-xl border border-hairline bg-surface p-6 transition-colors hover:border-accent/40"
            >
              <span className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-accent">
                the guarantee
              </span>
              <h3 className="mt-3 text-lg font-semibold">
                Eight neighbours, eight different amounts, one auditable total
              </h3>
              <p className="mt-2.5 flex-1 text-sm leading-relaxed text-muted">
                Commitments add. Each payment contributes to the building&rsquo;s balance
                without the chain ever holding a commitment to a single one of them. The
                treasurer opens the total; the line items stay shut.
              </p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm text-foreground">
                See the audit
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </StaggerItem>

          <StaggerItem>
            <Link
              href="/verify"
              className="group flex h-full flex-col rounded-xl border border-hairline bg-surface p-6 transition-colors hover:border-refused/40"
            >
              <span className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-refused">
                what breaks it
              </span>
              <h3 className="mt-3 text-lg font-semibold">
                That only holds if the history you replay is the real one
              </h3>
              <p className="mt-2.5 flex-1 text-sm leading-relaxed text-muted">
                Rebuilding a wallet means replaying events from an archive it did not write.
                Corrupt one yourself and watch the client refuse it — including the archives
                that claim to be complete while quietly dropping an event.
              </p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm text-foreground">
                Try to fool it
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </StaggerItem>
        </StaggerGroup>
      </section>

      <section className="border-y border-hairline/60 bg-surface/30">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <Reveal>
            <p className="eyebrow">What conformance actually caught</p>
            <h2 className="mt-4 max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
              Five defects, every one of them silent until real money moved.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
              None of these throw. Each produces a wallet that looks fine and is wrong — which
              is the whole reason OpenZeppelin wrote the obligations down.
            </p>
          </Reveal>

          <StaggerGroup className="mt-10 divide-y divide-hairline border-y border-hairline">
            {FINDINGS.map((f) => (
              <StaggerItem key={f.title}>
                <div className="grid gap-3 py-5 sm:grid-cols-[1fr_1.6fr] sm:gap-8">
                  <div>
                    <h3 className="text-[0.95rem] font-semibold leading-snug">{f.title}</h3>
                    <span className="mt-1.5 block font-mono text-[0.62rem] uppercase tracking-[0.14em] text-muted">
                      {f.where}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-muted">{f.body}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.25fr] lg:gap-16">
          <Reveal>
            <p className="eyebrow">Use it</p>
            <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
              The secret is derived, never stored.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Same signer, same key, on any device, forever. That is what makes an account
              recoverable — and it is the obligation the reference implementation got wrong.
            </p>
            <Link
              href="/docs"
              className="mt-6 inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
            >
              Read the docs
              <ArrowRight className="size-3.5" />
            </Link>
          </Reveal>

          <Reveal delay={0.08}>
            <pre className="overflow-x-auto rounded-xl border border-hairline bg-surface p-5 font-mono text-[0.78rem] leading-relaxed">
              <code>
                <span className="text-muted">
                  {"// The account secret comes from a signature, not from disk."}
                </span>
                {"\n"}
                <span className="text-accent">const</span> root ={" "}
                <span className="text-accent">await</span> wallet.signMessage({"\n  "}
                skSigningMessage(CONTRACT, ACCOUNT),{"\n"});{"\n"}
                <span className="text-accent">const</span> {"{ sk, addrF }"} = deriveSk(root,
                CONTRACT, ACCOUNT);{"\n\n"}
                <span className="text-accent">const</span> {"{ payload, next }"} ={" "}
                <span className="text-accent">await</span> proveTransfer({"{"}
                {"\n  "}keys: deriveKeys(sk, addrF),{"\n  "}v: spendable.v, r: spendable.r,
                {"\n  "}amount: <span className="text-verified">750n</span>,{"\n  "}pvkB:
                recipientViewingKey,{"\n"}
                {"}"});{"\n\n"}
                <span className="text-muted">
                  {"// Persist `next` BEFORE submitting. It is the only"}
                </span>
                {"\n"}
                <span className="text-muted">
                  {"// thing that can ever spend the result."}
                </span>
              </code>
            </pre>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-hairline/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted">
          <p>
            Apache-2.0 · testnet only, not audited · an independent implementation, not
            endorsed by OpenZeppelin
          </p>
          <div className="flex gap-4">
            <a
              className="hover:text-foreground"
              href="https://github.com/aguilar1x/stellar-confidential-token-sdk"
            >
              GitHub
            </a>
            <a
              className="hover:text-foreground"
              href="https://www.npmjs.com/package/stellar-confidential-token-sdk"
            >
              npm
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
