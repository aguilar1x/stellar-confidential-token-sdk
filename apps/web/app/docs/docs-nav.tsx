"use client";

import { useEffect, useState } from "react";

/**
 * Marks which section you are reading.
 *
 * A table of contents that never says where you are is a list of links; the
 * whole reason it is sticky is to answer "where am I in this document". So the
 * headings are observed and the matching entry lights up.
 *
 * Two details that keep it from flickering, which is worse than no indicator at
 * all:
 *
 *   - The observation band is a thin strip below the fixed nav rather than the
 *     whole viewport. With a tall viewport several sections are visible at once,
 *     and "topmost visible" jumps around as you scroll; a strip has one answer.
 *   - The last active section is kept when nothing is in the strip — between two
 *     sections, or at the very bottom where the last one has scrolled past the
 *     band. Clearing it would blank the indicator exactly where a reader is most
 *     likely to look at it.
 */
export function DocsNav({ sections }: { sections: { id: string; title: string }[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const nodes = sections
      .map((s) => document.getElementById(s.id))
      .filter((n): n is HTMLElement => n !== null);
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Entries fire per-change, so consult the live state of every section
        // rather than only the ones that just moved.
        const visible = nodes
          .filter((n) => {
            const r = n.getBoundingClientRect();
            return r.top < 200 && r.bottom > 80;
          })
          .map((n) => n.id);

        if (visible.length > 0) setActive(visible[0]!);
        void entries;
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: [0, 0.05, 0.5, 1] },
    );

    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label="Sections" className="mb-10 lg:mb-0">
      <ul className="space-y-0.5 border-l border-rule lg:sticky lg:top-24">
        {sections.map((s) => {
          const current = s.id === active;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={current ? "location" : undefined}
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
  );
}
