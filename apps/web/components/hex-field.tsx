/**
 * The hero backdrop.
 *
 * Where the sibling project uses a photograph, this uses the subject's own
 * material: rows of real commitment hex, faint and faded at both edges. It is
 * the honest version of a hero image here — a stock photo would say nothing
 * about confidential tokens, while this is literally the thing the page is
 * about, rendered as texture.
 *
 * Deterministic: the rows are derived from the seed commitment by rotation, so
 * the same hero renders identically on every request and in every build. Random
 * hex would shimmer between server and client and force a hydration opt-out.
 */
export function HexField({ seed }: { seed: string }) {
  const base = seed && /^[0-9a-f]+$/i.test(seed) ? seed : "0".repeat(128);

  const rows = Array.from({ length: 14 }, (_, i) => {
    const shift = (i * 17) % base.length;
    return (base.slice(shift) + base.slice(0, shift)).repeat(3);
  });

  return (
    <div aria-hidden className="hex-field absolute inset-0 overflow-hidden px-4">
      {rows.map((r, i) => (
        <p key={i} className="whitespace-nowrap">
          {r}
        </p>
      ))}
    </div>
  );
}
