"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/docs", label: "Docs" },
  { href: "/demo", label: "Demo" },
  { href: "/verify", label: "Break it" },
];

export function Nav() {
  const path = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-hairline/70 bg-background/80 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
          {/* A commitment, reduced to a mark: a sealed value you can still point at. */}
          <span
            aria-hidden
            className="inline-block size-2.5 rounded-full bg-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)]"
          />
          confidential&#8203;-token-sdk
        </Link>

        <div className="ml-auto flex items-center gap-1">
          {LINKS.map((l) => {
            const active = path === l.href || path.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-surface-raised text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
          <a
            href="https://github.com/aguilar1x/stellar-confidential-token-sdk"
            className="ml-2 rounded-md bg-foreground px-3.5 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            GitHub
          </a>
        </div>
      </nav>
    </header>
  );
}
