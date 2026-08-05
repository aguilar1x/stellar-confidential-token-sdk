"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { useStepAction } from "./steps";

/**
 * The two links whose being clicked is what completes a step.
 *
 * Both are ordinary links that also report. Kept apart from the markup they
 * live in so the ledger table and the closing call-to-action can stay server
 * components — only the anchor itself needs to be interactive.
 */

/**
 * A transaction on the block explorer.
 *
 * This is the action of step one. Reading a table of the word "sealed" proves
 * nothing on its own; opening a row on an explorer we do not control, and
 * finding a real transaction with no amount in it, is the whole point of the
 * step being there.
 */
export function ExplorerLink({ href, label }: { href: string; label: string }) {
  const opened = useStepAction("ledger");
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={opened}
      onAuxClick={opened}
      className="inline-flex items-center gap-1 font-mono text-xs text-ink-soft hover:text-accent"
    >
      {label}
      <ExternalLink className="size-3" />
    </a>
  );
}

/** Leaving for the page that lets them attack it — the action of step three. */
export function StepLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  const left = useStepAction("check");
  return (
    <Link
      href={href}
      onClick={left}
      onAuxClick={left}
      className={
        variant === "primary"
          ? "inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          : "inline-flex items-center gap-2 rounded-md border border-rule px-5 py-2.5 text-sm text-ink-soft transition-colors hover:text-ink"
      }
    >
      {children}
    </Link>
  );
}
