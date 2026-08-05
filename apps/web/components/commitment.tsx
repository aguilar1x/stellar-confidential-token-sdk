/**
 * The signature element.
 *
 * A commitment is what this whole protocol puts on a public ledger in place of
 * an amount: a curve point, 64 bytes, meaningless to anyone without the
 * opening. Every page shows one, because it is the thing being argued about.
 *
 * It is rendered as the full hex rather than a truncated preview wherever there
 * is room. Truncating it would make it read as an id — a handle for something
 * stored elsewhere — when the point is the opposite: this IS the stored value,
 * and it discloses nothing.
 */
export function Commitment({
  hex,
  label,
  tone = "sealed",
  truncate,
}: {
  hex: string;
  label?: string;
  tone?: "sealed" | "verified" | "refused";
  truncate?: number;
}) {
  const shown = truncate ? `${hex.slice(0, truncate)}…` : hex;
  const toneClass =
    tone === "verified"
      ? "text-verified/85"
      : tone === "refused"
        ? "text-refused/85"
        : "text-sealed";

  return (
    <div>
      {label && (
        <span className="mb-1.5 block font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-ink-soft">
          {label}
        </span>
      )}
      <code className={`commitment block ${toneClass}`}>{shown}</code>
    </div>
  );
}

/** An amount that exists on-chain and cannot be read from it. */
export function SealedAmount({ className = "" }: { className?: string }) {
  return (
    <span className={`sealed font-mono text-sealed ${className}`}>
      <span className="sr-only">amount hidden on-chain</span>
      <span aria-hidden>hidden</span>
    </span>
  );
}
