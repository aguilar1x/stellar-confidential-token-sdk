import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";

import { Reveal } from "@/components/reveal";
import { SECTIONS, type Block } from "./content";
import { CopyButton } from "./copy-button";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Derive an account secret, rebuild state from the chain, send a confidential transfer, and read from an archive you do not trust.",
};

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="mt-5 space-y-5">
      {blocks.map((b, i) => {
        if (b.kind === "p") {
          return (
            <p key={i} className="max-w-2xl text-sm leading-relaxed text-muted">
              {b.text}
            </p>
          );
        }

        if (b.kind === "code") {
          return (
            <div key={i} className="group relative">
              <pre className="overflow-x-auto rounded-xl border border-hairline bg-surface p-5 font-mono text-[0.78rem] leading-relaxed">
                <code>{b.code}</code>
              </pre>
              <CopyButton text={b.code} />
            </div>
          );
        }

        if (b.kind === "note") {
          const warn = b.tone === "warn";
          return (
            <aside
              key={i}
              className={`rounded-xl border p-4 ${
                warn ? "border-refused/30 bg-refused/[0.04]" : "border-accent/25 bg-accent/[0.04]"
              }`}
            >
              <p
                className={`flex items-center gap-2 text-[0.82rem] font-semibold ${
                  warn ? "text-refused" : "text-accent"
                }`}
              >
                {warn ? <AlertTriangle className="size-3.5" /> : <Info className="size-3.5" />}
                {b.title}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{b.text}</p>
            </aside>
          );
        }

        return (
          <div key={i} className="overflow-x-auto rounded-xl border border-hairline bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline">
                  {b.head.map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-4 py-2.5 text-left font-mono text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {b.rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((cell, ci) => (
                      <td
                        key={ci}
                        className={`px-4 py-2.5 align-top ${
                          ci === 0 ? "whitespace-nowrap font-mono text-xs" : "text-muted"
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

export default function Docs() {
  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-16">
      <Reveal>
        <p className="eyebrow">Docs</p>
        <h1 className="mt-4 max-w-2xl text-[2.1rem] font-bold leading-[1.1] tracking-tight sm:text-4xl">
          Everything a wallet has to get right.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
          Ordered the way you would actually build: derive a key, rebuild state, spend, and
          only then worry about where the history came from.
        </p>
      </Reveal>

      <div className="mt-14 gap-14 lg:grid lg:grid-cols-[190px_1fr]">
        {/* Sidebar. Sticky on desktop, a plain list on mobile. */}
        <nav aria-label="Sections" className="mb-10 lg:mb-0">
          <ul className="lg:sticky lg:top-24 space-y-0.5 border-l border-hairline">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="-ml-px block border-l border-transparent py-1.5 pl-4 text-sm text-muted transition-colors hover:border-accent hover:text-foreground"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-16">
          {SECTIONS.map((s) => (
            <Reveal key={s.id}>
              <section id={s.id} className="scroll-mt-24">
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{s.title}</h2>
                {s.lede && <p className="mt-2 text-sm text-muted">{s.lede}</p>}
                <Blocks blocks={s.blocks} />
              </section>
            </Reveal>
          ))}

          <Reveal>
            <section className="rounded-xl border border-hairline bg-surface p-6">
              <h2 className="text-lg font-semibold">Then go break something</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
                The checks above are easier to trust once you have watched them fire. Corrupt
                an archive and see the client refuse it, or read the eight-payment audit they
                were protecting.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/verify"
                  className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
                >
                  Break the archive
                </Link>
                <Link
                  href="/demo"
                  className="rounded-md border border-hairline px-4 py-2 text-sm font-medium transition-colors hover:border-accent/50 hover:text-accent"
                >
                  See the audit
                </Link>
              </div>
            </section>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
