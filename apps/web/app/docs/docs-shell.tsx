"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Info, Search, X } from "lucide-react";

import { CopyButton } from "./copy-button";
import type { Block, Section } from "./content";

/**
 * Everything in a section that a reader might be looking for, as one string.
 *
 * Titles alone would be a filter, not a search: across seven sections a reader
 * already sees every title, so matching only those finds nothing they could not
 * find by looking. What sends someone to a search box is a name they half
 * remember, `verifyAgainstChain` or `IncompleteHistoryError`, and those live in
 * the code blocks and the warning notes.
 */
function haystack(s: Section): string {
  const parts: string[] = [s.title, s.lede ?? ""];
  for (const b of s.blocks) {
    if (b.kind === "p") parts.push(b.text);
    else if (b.kind === "code") parts.push(b.code);
    else if (b.kind === "note") parts.push(b.title, b.text);
    else parts.push(...b.head, ...b.rows.flat());
  }
  return parts.join("\n");
}

/** Where the term appears, with enough either side to recognise it. */
function snippet(text: string, q: string): string | null {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return null;
  const from = Math.max(0, i - 28);
  const to = Math.min(text.length, i + q.length + 40);
  return `${from > 0 ? "…" : ""}${text.slice(from, to).replace(/\s+/g, " ").trim()}${
    to < text.length ? "…" : ""
  }`;
}

/**
 * Mark every occurrence of the term inside a run of text.
 *
 * A search that lands you on a section and then leaves you to scan it is half a
 * search. The term is escaped before it reaches the regex, because the box
 * accepts whatever is typed and `(` or `*` would otherwise throw on keystroke.
 */
function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const parts = text.split(
    new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"),
  );
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="rounded-sm bg-accent-soft px-0.5 text-ink">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

/**
 * Docs as navigation rather than as one long page.
 *
 * The sidebar looked like navigation and behaved like a table of contents.
 * Clicking jumped you into a scroll position, and reading one section ran you
 * into the next. Those are two different mental models and mixing them is what
 * made it confusing. Now a section is a destination: one at a time, and the
 * sidebar says which.
 *
 * Deep links still work. The hash is read on mount and written on selection, so
 * a link to a specific section opens on it and the URL stays shareable, which
 * a purely client-side tab strip would have quietly broken.
 */
export function DocsShell({ sections }: { sections: Section[] }) {
  const [activeId, setActiveId] = useState(sections[0]!.id);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLInputElement>(null);

  const q = query.trim();

  /** Built once per section list; searching is then a substring test per key. */
  const corpus = useMemo(
    () => sections.map((s) => ({ id: s.id, text: haystack(s) })),
    [sections],
  );

  const hits = useMemo(() => {
    if (!q) return null;
    const needle = q.toLowerCase();
    const ids = new Set(
      corpus
        .filter((e) => e.text.toLowerCase().includes(needle))
        .map((e) => e.id),
    );
    return sections
      .filter((s) => ids.has(s.id))
      .map((s) => ({
        section: s,
        // The title is shown already, so the snippet is only worth space when
        // the term is somewhere the reader cannot see.
        where: s.title.toLowerCase().includes(needle)
          ? null
          : snippet(corpus.find((e) => e.id === s.id)!.text, q),
      }));
  }, [q, corpus, sections]);

  /** `/` is what a docs reader reaches for; Escape gets them back out. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        box.current?.focus();
      } else if (e.key === "Escape" && el === box.current) {
        setQuery("");
        box.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    <>
      {/* Above the rule and hard right, opposite the page's own heading. It
          belongs to the whole document rather than to the section list, and a
          reader looking for a search box looks at the top of the page before
          they look inside a column. */}
      <div className="mt-8 flex justify-end lg:-mt-12">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-soft" />
          <input
            ref={box}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the docs"
            aria-label="Search the docs"
            className="w-full rounded-lg border border-rule bg-paper-sunk py-2 pl-9 pr-8 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-accent [&::-webkit-search-cancel-button]:appearance-none"
          />
          {q ? (
            <button
              onClick={() => {
                setQuery("");
                box.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-soft transition-colors hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            // The hint occupies the slot the clear button will take, so
            // nothing shifts when the first character is typed.
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-rule bg-paper px-1.5 font-mono text-[0.6rem] text-ink-soft lg:block">
              /
            </kbd>
          )}
        </div>
      </div>

      <div className="mt-8 gap-14 border-t border-rule pt-12 lg:grid lg:grid-cols-[210px_1fr]">
        <nav aria-label="Sections" className="mb-10 lg:mb-0">
          <div className="lg:sticky lg:top-24">
            {hits && (
              <p className="mb-2 px-1 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-ink-soft">
                {hits.length === 0
                  ? "nothing matched"
                  : `${hits.length} of ${sections.length} sections`}
              </p>
            )}

            <ul className="space-y-0.5 border-l border-rule">
              {(hits ?? sections.map((s) => ({ section: s, where: null }))).map(
                ({ section: s, where }) => {
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
                        <Highlight text={s.title} q={q} />
                        {where && (
                          <span className="mt-0.5 block font-mono text-[0.62rem] leading-snug text-ink-soft">
                            <Highlight text={where} q={q} />
                          </span>
                        )}
                      </a>
                    </li>
                  );
                },
              )}
            </ul>
          </div>
        </nav>

        <div className="min-w-0">
          <article>
            <p className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
              {String(index + 1).padStart(2, "0")} of{" "}
              {String(sections.length).padStart(2, "0")}
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              <Highlight text={active.title} q={q} />
            </h2>
            {active.lede && (
              <p className="mt-2.5 text-[0.94rem] text-ink-soft">
                <Highlight text={active.lede} q={q} />
              </p>
            )}
            <Blocks blocks={active.blocks} q={q} />
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
    </>
  );
}

function Blocks({ blocks, q }: { blocks: Block[]; q: string }) {
  return (
    <div className="mt-7 space-y-5">
      {blocks.map((b, i) => {
        if (b.kind === "p") {
          return (
            <p
              key={i}
              className="max-w-2xl text-[0.94rem] leading-relaxed text-ink-soft"
            >
              <Highlight text={b.text} q={q} />
            </p>
          );
        }

        if (b.kind === "code") {
          return (
            <div key={i} className="group relative">
              <pre className="overflow-x-auto rounded-xl bg-code p-5 font-mono text-[0.78rem] leading-relaxed text-white/85">
                <code>{b.code}</code>
              </pre>
              <CopyButton text={b.code} />
            </div>
          );
        }

        if (b.kind === "note") {
          const warn = b.tone === "warn";
          return (
            /**
             * A rule, not a tint.
             *
             * Washing the whole block in the tone's colour is the reflex, and it
             * is why these read as generated: the surface does the shouting and
             * the text inside has to compete with it. A 2px rule down the left
             * edge is the older, quieter device, it marks the block as an
             * aside, keeps the tone legible at a glance, and leaves the body on
             * the same surface as every other block on the page.
             */
            <aside
              key={i}
              className={`rounded-r-xl border-y border-r border-rule border-l-2 bg-paper-sunk py-4 pl-5 pr-4 ${
                warn ? "border-l-refused" : "border-l-accent"
              }`}
            >
              <p
                className={`flex items-center gap-2 text-[0.82rem] font-semibold ${
                  warn ? "text-refused" : "text-accent"
                }`}
              >
                {warn ? (
                  <AlertTriangle className="size-3.5" />
                ) : (
                  <Info className="size-3.5" />
                )}
                <Highlight text={b.title} q={q} />
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                <Highlight text={b.text} q={q} />
              </p>
            </aside>
          );
        }

        return (
          <div
            key={i}
            className="overflow-x-auto rounded-xl border border-rule bg-paper-sunk"
          >
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
                          ci === 0
                            ? "whitespace-nowrap font-mono text-xs"
                            : "text-ink-soft"
                        }`}
                      >
                        <Highlight text={cell} q={q} />
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
