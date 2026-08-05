import type { Metadata } from "next";
import Link from "next/link";

import { Reveal } from "@/components/reveal";
import { SECTIONS } from "./content";
import { DocsShell } from "./docs-shell";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Derive an account secret, rebuild state from the chain, send a confidential transfer, and read from an archive you do not trust.",
};

export default function Docs() {
  return (
    <div className="mx-auto max-w-6xl px-6 pb-24 pt-32">
      <Reveal>
        <p className="eyebrow">Docs</p>
        <h1 className="mt-4 max-w-2xl text-[2.1rem] font-bold leading-[1.1] tracking-tight sm:text-4xl">
          Everything a wallet has to get right.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-soft">
          Ordered the way you would actually build: derive a key, rebuild state, spend, and
          only then worry about where the history came from.
        </p>
      </Reveal>

      <DocsShell sections={SECTIONS} />

      <Reveal>
        <section className="mt-20 border-t border-rule pt-10">
          <h2 className="text-lg font-semibold">Then go break something</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
            The checks here are easier to trust once you have watched them fire. Corrupt an
            archive and see the client refuse it, or read the eight-payment audit they were
            protecting.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/verify"
              className="inline-block rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Break the archive
            </Link>
            <Link
              href="/demo"
              className="rounded-full border border-rule px-4 py-2 text-sm font-medium transition-colors hover:border-accent/50 hover:text-accent"
            >
              See the audit
            </Link>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
