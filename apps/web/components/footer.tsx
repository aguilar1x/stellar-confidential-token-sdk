import { ExternalLink, Github, Package } from "lucide-react";

import { version } from "../../../packages/sdk/package.json";
import { CONTRACTS, EXPLORER_CONTRACT, EXTERNAL_ARCHIVE } from "@/lib/demo";

/**
 * The footer as a list of things to go check, not a list of pages.
 *
 * The nav is fixed, so it is on screen at the bottom of the longest page here;
 * repeating Demo/How/Docs underneath would be filler that looks like substance.
 * What a reader cannot reach from the nav is everything this site asks them not
 * to take on trust: the package that was published, the contracts it runs
 * against, and the archive serving the history. Those are the links.
 *
 * The version is imported from the package rather than written here. It drifted
 * once already, the repository saying one number while npm served another, and
 * a stale version in a footer is the kind of small wrong thing that makes a
 * reader wonder what else is stale.
 */

const short = (id: string) => `${id.slice(0, 6)}…${id.slice(-4)}`;

const ON_CHAIN = [
  { label: "token", id: CONTRACTS.token },
  { label: "verifier", id: CONTRACTS.verifier },
  { label: "auditor", id: CONTRACTS.auditor },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="text-sm font-semibold text-ink">
              stellar-confidential-token-sdk
            </p>
            <p className="mt-2 max-w-xs text-[0.86rem] leading-relaxed text-ink-soft">
              A TypeScript client for OpenZeppelin Confidential Tokens on
              Stellar, and the archive it replays history from.
            </p>
            <div className="mt-4 flex flex-wrap gap-4 text-[0.86rem]">
              <Link href="https://github.com/aguilar1x/stellar-confidential-token-sdk">
                <Github className="size-3.5" />
                GitHub
              </Link>
              <Link href="https://www.npmjs.com/package/stellar-confidential-token-sdk">
                <Package className="size-3.5" />
                npm
                <span className="font-mono text-[0.78rem] text-ink-soft">
                  {version}
                </span>
              </Link>
            </div>
          </div>

          <div>
            <p className="footer-label">Running on testnet</p>
            <ul className="mt-3 space-y-1.5">
              {ON_CHAIN.map((c) => (
                <li key={c.label}>
                  <Link href={`${EXPLORER_CONTRACT}/${c.id}`} title={c.id}>
                    <span className="w-[3.6rem] shrink-0 text-ink-soft">
                      {c.label}
                    </span>
                    <span className="font-mono text-[0.78rem]">
                      {short(c.id)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="footer-label">The archive</p>
            <ul className="mt-3 space-y-1.5">
              <li>
                <Link href={`${EXTERNAL_ARCHIVE}/v1/health`}>
                  ingestion status
                </Link>
              </li>
              <li>
                <Link href="https://github.com/aguilar1x/stellar-confidential-token-sdk/tree/master/apps/indexer">
                  source
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* The disclaimers sit under a rule of their own. They are the last thing
            read and they are load-bearing: someone who skims this page and puts
            real money behind it has misread it. */}
        <p className="mt-10 border-t border-rule pt-6 text-[0.82rem] leading-relaxed text-ink-soft">
          Apache-2.0 · testnet only, not audited, do not hold value with this ·
          an independent implementation, not endorsed by or affiliated with
          OpenZeppelin
        </p>
      </div>
    </footer>
  );
}

/** Every link here leaves the site, so every one of them says so. */
function Link({
  href,
  title,
  children,
}: {
  href: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title}
      className="group inline-flex items-center gap-1.5 text-[0.86rem] text-ink-soft transition-colors hover:text-ink"
    >
      {children}
      <ExternalLink className="size-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
    </a>
  );
}
