/**
 * The hero backdrop.
 *
 * A stock photograph would say nothing about confidential tokens, and a
 * gradient mesh is what every generated landing page reaches for. So the
 * backdrop is the subject itself, in three layers:
 *
 *   1. an indigo field, so the panel has depth rather than being flat ink;
 *   2. the actual Grumpkin curve — y² = x³ − 17 — plotted from its real
 *      equation. Every commitment on this chain is a point on that curve, so it
 *      is the one shape that is literally underneath everything the page
 *      claims;
 *   3. rows of real commitment hex, faint and faded, in `HexField`.
 *
 * All of it is deterministic and drawn from data, so the hero renders
 * identically on every request and needs no image asset at all.
 */

/** Sample one branch of y² = x³ − 17 and map it into the viewBox. */
function curvePath(flip = false): string {
  const X_MIN = Math.cbrt(17);
  const X_MAX = 9;
  const Y_MAX = Math.sqrt(X_MAX ** 3 - 17);

  const pts: string[] = [];
  for (let x = X_MIN; x <= X_MAX; x += 0.03) {
    const y2 = x ** 3 - 17;
    if (y2 < 0) continue;
    const y = Math.sqrt(y2);
    // Map to a 1000×600 box: x across, y from the vertical centre.
    const px = ((x - X_MIN) / (X_MAX - X_MIN)) * 1000;
    const py = 300 - (flip ? -1 : 1) * (y / Y_MAX) * 290;
    pts.push(`${px.toFixed(2)},${py.toFixed(2)}`);
  }
  return `M${pts.join(" L")}`;
}

export function HeroBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {/* Depth. Two off-centre pools rather than a centred radial, which reads
          as a template. */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_78%_-10%,hsl(243_58%_30%),transparent_58%),radial-gradient(90%_70%_at_8%_110%,hsl(250_45%_22%),transparent_60%)]" />

      <svg
        viewBox="0 0 1000 600"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
      >
        <defs>
          <linearGradient id="curve-fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="42%" stopColor="white" stopOpacity="0.34" />
            <stop offset="100%" stopColor="white" stopOpacity="0.06" />
          </linearGradient>
        </defs>

        {/* The curve, both branches. Drawn large and cropped, so it reads as
            structure rather than as a diagram. */}
        <g
          transform="translate(140 40) scale(1.35)"
          fill="none"
          stroke="url(#curve-fade)"
          strokeWidth="1.25"
        >
          <path d={curvePath()} />
          <path d={curvePath(true)} />
        </g>
      </svg>
    </div>
  );
}
