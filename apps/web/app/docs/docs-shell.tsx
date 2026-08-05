"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";

import { CopyButton } from "./copy-button";
import type { Block, Section } from "./content";

/**
 * Docs as navigation rather than as one long page.
 *
 * The sidebar looked like navigation and behaved like a table of contents —
 * clicking jumped you into a scroll position, and reading one section ran you
 * into the next. Those are two different mental models and mixing them is what
 * made it confusing. Now a section is a destination: one at a time, and the
 * sidebar says which.
 *
 * Deep links still work. The hash is read on mount and written on selection, so
 * a link to a specific section opens on it and the URL stays shareable — which
 * a purely client-side tab strip would have quietly broken.
 */
export function DocsShell({ sections }: { sections: Section[] }) {
  const [activeId, setActiveId] = useState(sections[0]!.id);

  // Honour an incoming #hash, and keep following the back button.
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace("#", "");
      if (sections.some((s) => s.id === id)) setActiveId(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [sections]);

  const select = (id: string) => {
    setActiveId(id);
    // replaceState rather than a hash assignment: it keeps the URL shareable
    // without the browser also scrolling to an anchor that no longer exists.
    window.history.replaceState(null, "", `#${id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const active = sections.find((s) => s.id === activeId) ?? sections[0]!;
  const index = sections.indexOf(active);
  const next = sections[index + 1];
  const prev = sections[index - 1];

  return (
    <div className="mt-12 gap-14 border-t border-rule pt-12 lg:grid lg:grid-cols-[210px_1fr]">
      <nav aria-label="Sections" className="mb-10 lg:mb-0">
        <ul className="space-y-0.5 border-l border-rule lg:sticky lg:top-24">
          {sections.map((s) => {
            const current = s.id === active.id;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={current ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    select(s.id);
                  }}
                  className={`-ml-px block border-l py-1.5 pl-4 text-sm transition-colors ${
                    current
                      ? "border-accent font-semibold text-ink"
                      : "border-transparent text-ink-soft hover:border-rule-strong hover:text-ink"
                  }`}
                >
                  {s.title}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0">
        <article>
          <p className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
            {String(index + 1).padStart(2, "0")} of {String(sections.length).padStart(2, "0")}
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{active.title}</h2>
          {active.lede && <p className="mt-2.5 text-[0.94rem] text-ink-soft">{active.lede}</p>}
          <Blocks blocks={active.blocks} />
        </article>

        {/* Sequence is the point of the ordering, so the way out of a section is
            the next one rather than a scroll. */}
        <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-6">
          {prev ? (
            <button
              onClick={() => select(prev.id)}
              className="text-left text-sm text-ink-soft transition-colors hover:text-ink"
            >
              <span className="block font-mono text-[0.58rem] uppercase tracking-[0.12em]">
                previous
              </span>
              <span className="mt-0.5 block font-medium">{prev.title}</span>
            </button>
          ) : (
            <span />
          )}
          {next && (
            <button
              onClick={() => select(next.id)}
              className="text-right text-sm transition-colors hover:text-accent"
            >
              <span className="block font-mono text-[0.58rem] uppercase tracking-[0.12em] text-ink-soft">
                next
              </span>
              <span className="mt-0.5 block font-medium">{next.title}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="mt-7 space-y-5">
      {blocks.map((b, i) => {
        if (b.kind === "p") {
          return (
            <p key={i} className="max-w-2xl text-[0.94rem] leading-relaxed text-ink-soft">
              {b.text}
            </p>
          );
        }

        if (b.kind === "code") {
          return (
            <div key={i} className="group relative">
              <pre className="overflow-x-auto rounded-xl bg-ink p-5 font-mono text-[0.78rem] leading-relaxed text-white/85">
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
                warn ? "border-refused/30 bg-red-50/60" : "border-accent/25 bg-accent-soft"
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
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{b.text}</p>
            </aside>
          );
        }

        return (
          <div key={i} className="overflow-x-auto rounded-xl border border-rule bg-paper-sunk">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rule">
                  {b.head.map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-4 py-2.5 text-left font-mono text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-ink-soft"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {b.rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((cell, ci) => (
                      <td
                        key={ci}
                        className={`px-4 py-2.5 align-top ${
                          ci === 0 ? "whitespace-nowrap font-mono text-xs" : "text-ink-soft"
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
