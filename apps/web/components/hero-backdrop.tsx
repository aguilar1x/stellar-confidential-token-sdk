/**
 * The hero backdrop.
 *
 * A stock photograph would say nothing about confidential tokens, and a
 * gradient mesh is what every generated landing page reaches for. So the
 * backdrop is the subject: an off-centre indigo field for depth, and the actual
 * Grumpkin curve — y² = x³ − 17 — which is the curve every commitment on this
 * chain is a point on.
 *
 * The curve is positioned so its VERTEX is on screen. That matters: cropped
 * anywhere else it degenerates into a straight diagonal, which reads as a stray
 * rule rather than as the shape underneath the whole protocol.
 */

const VIEW_W = 1200;
const VIEW_H = 760;

/** Where the curve's vertex sits in the viewBox, and how far it sweeps. */
const VERTEX_X = 690;
const CENTER_Y = 620;
const SPREAD_X = 420;
const SPREAD_Y = 210;

const X_MIN = Math.cbrt(17);
const X_MAX = 9;
const Y_MAX = Math.sqrt(X_MAX ** 3 - 17);

/** Sample one branch of y² = x³ − 17 and map it into the viewBox. */
function curvePath(flip = false): string {
  const pts: string[] = [];
  for (let x = X_MIN; x <= X_MAX; x += 0.015) {
    const y2 = x ** 3 - 17;
    if (y2 < 0) continue;
    const y = Math.sqrt(y2);
    const px = VERTEX_X + ((x - X_MIN) / (X_MAX - X_MIN)) * SPREAD_X;
    const py = CENTER_Y - (flip ? -1 : 1) * (y / Y_MAX) * SPREAD_Y;
    pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }
  return `M${pts.join(" L")}`;
}

const UPPER = curvePath();
const LOWER = curvePath(true);

export function HeroBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(115%_85%_at_82%_8%,hsl(243_58%_31%),transparent_60%),radial-gradient(85%_70%_at_2%_105%,hsl(252_46%_20%),transparent_62%)]" />

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMaxYMax slice"
        className="absolute inset-0 size-full"
      >
        <defs>
          <linearGradient id="curve-fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="white" stopOpacity="0.5" />
            <stop offset="45%" stopColor="white" stopOpacity="0.2" />
            <stop offset="100%" stopColor="white" stopOpacity="0.03" />
          </linearGradient>
          <radialGradient id="vertex-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="hsl(243 70% 62%)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="hsl(243 70% 62%)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* A soft bloom where the two branches meet, so the vertex reads as a
            point of interest rather than a kink. */}
        <circle cx={VERTEX_X} cy={CENTER_Y} r="150" fill="url(#vertex-glow)" />

        <g fill="none" stroke="url(#curve-fade)" strokeWidth="1.4" strokeLinecap="round">
          <path d={UPPER} />
          <path d={LOWER} />
        </g>
      </svg>
    </div>
  );
}
