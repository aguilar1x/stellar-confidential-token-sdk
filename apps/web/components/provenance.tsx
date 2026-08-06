import { ExternalLink } from "lucide-react";

import { EXPLORER_ACCOUNT, EXPLORER_CONTRACT } from "@/lib/demo";

/**
 * Where the numbers being checked came from.
 *
 * Both verification panels let a reader redo the arithmetic on their own
 * machine — and then hand them the inputs. So the honest objection is not about
 * the maths, which they can watch: it is that the total, the blinding and the
 * on-chain commitment all arrive from this server. A sceptic can reasonably say
 * we could have produced three numbers that agree with each other and none of
 * which the chain has ever seen.
 *
 * That objection costs two links to close. The contract and the account are
 * public, the balance is a public ledger entry, and any RPC or explorer will
 * serve it — so the reader can check the INPUT against a source we do not
 * control, not just the arithmetic against itself.
 *
 * `rpcUrl` is shown as text rather than linked: it answers a `POST` and a link
 * to it would open a page that errors, which is a worse experience than a
 * string someone can paste into their own client.
 */
export function Provenance({
  contract,
  account,
  rpcUrl,
  what,
}: {
  contract: string;
  account: string;
  rpcUrl: string;
  /** What the reader would be reading, in this panel's own words. */
  what: string;
}) {
  return (
    <div className="border-t border-rule px-6 py-4">
      <p className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
        where these numbers came from
      </p>
      <p className="mt-2 text-[0.82rem] leading-relaxed text-ink-soft">
        This page read {what} off the chain and handed it to your browser. Do not take that on
        trust either: the account and the contract are public, so read the balance yourself
        from any RPC and compare it to the commitment above.
      </p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-3">
        <Item label="token contract" value={contract} href={`${EXPLORER_CONTRACT}/${contract}`} />
        <Item
          label="the building's account"
          value={account}
          href={`${EXPLORER_ACCOUNT}/${account}`}
        />
        <Item label="rpc used here" value={rpcUrl} />
      </dl>
    </div>
  );
}

function Item({ label, value, href }: { label: string; value: string; href?: string }) {
  const shown = value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[0.58rem] uppercase tracking-[0.12em] text-ink-soft">
        {label}
      </dt>
      <dd className="mt-0.5 min-w-0">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            title={value}
            className="inline-flex items-center gap-1 font-mono text-[0.72rem] text-accent hover:underline"
          >
            {shown}
            <ExternalLink className="size-2.5" />
          </a>
        ) : (
          <span title={value} className="block truncate font-mono text-[0.72rem] text-ink-soft">
            {value}
          </span>
        )}
      </dd>
    </div>
  );
}
