"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Github } from "lucide-react";

const LINKS = [
  { href: "/docs", label: "Docs" },
  { href: "/demo", label: "Demo" },
  { href: "/verify", label: "Break it" },
];

/**
 * A floating pill rather than a full-width bar.
 *
 * It has to read cleanly against two different backgrounds — the dark hero on
 * the home page and plain white everywhere else — so it stays white with a soft
 * shadow in both cases instead of going translucent, which would muddy over the
 * hex field behind it.
 */
export function Nav() {
  const path = usePathname();

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <nav className="pill-raised pointer-events-auto flex items-center gap-1 rounded-full border border-rule bg-paper py-1.5 pl-5 pr-1.5">
        <Link
          href="/"
          aria-label="Home"
          className="mr-5 flex items-center gap-2 text-[0.86rem] font-bold tracking-tight text-ink"
        >
          <span
            aria-hidden
            className="inline-block size-2 rounded-full bg-accent ring-4 ring-accent/12"
          />
          <span className="hidden sm:inline">ct-sdk</span>
        </Link>

        {LINKS.map((l) => {
          const active = path === l.href || path.startsWith(`${l.href}/`);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-[0.86rem] transition-colors ${
                active ? "font-semibold text-ink" : "text-ink-soft hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          );
        })}

        <a
          href="https://github.com/aguilar1x/stellar-confidential-token-sdk"
          className="btn-raised ml-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[0.86rem] font-medium text-white"
        >
          <Github className="size-3.5" />
          GitHub
        </a>
      </nav>
    </div>
  );
}
