import Link from "next/link";

import { EXPLORER } from "@/lib/demo";
import { BUILDING } from "./data";
import { auditBuilding, demonstrateHomomorphism } from "./audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const XLM = 10_000_000n;
const xlm = (stroops: string | bigint) =>
  `${(Number(BigInt(stroops)) / Number(XLM)).toLocaleString("en-US")} XLM`;

export default async function Condominium() {
  const [audit, homo] = await Promise.all([auditBuilding(), demonstrateHomomorphism()]);

  return (
    <main>
      <header>
        <p className="eyebrow">A month of dues · Stellar testnet</p>
        <h1>Everyone can audit the total. Nobody can see your payment.</h1>
        <p className="lede">
          Eight units in a building paid this month&rsquo;s dues. The amounts differ — a studio
          does not pay what the penthouse pays — and <em>none of them are on-chain</em>.
        </p>
        <p className="lede">
          Yet any resident can verify that the building collected exactly what it says it
          collected. Not by trusting the treasurer, and not by being shown the ledger. By
          arithmetic.
        </p>
      </header>

      <section className="ledger">
        <table>
          <thead>
            <tr>
              <th>Unit</th>
              <th>Type</th>
              <th>Paid</th>
              <th>On-chain</th>
            </tr>
          </thead>
          <tbody>
            {BUILDING.units.map((u) => (
              <tr key={u.id}>
                <td className="unit">{u.id}</td>
                <td className="muted">{u.label}</td>
                <td className="hidden-amount">hidden</td>
                <td>
                  {u.tx ? (
                    <a href={`${EXPLORER}/${u.tx}`} target="_blank" rel="noreferrer">
                      {u.tx.slice(0, 10)}…
                    </a>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>
                <strong>Collected this month</strong>
              </td>
              <td colSpan={2} className="total">
                {xlm(audit.published)}
              </td>
            </tr>
          </tfoot>
        </table>
        <p className="aside">
          The &ldquo;hidden&rdquo; column is not a UI choice. Those amounts are not published
          anywhere — each is sealed inside a commitment, and only the payer and the building
          can open it.
        </p>
      </section>

      <section className={audit.ok ? "audit ok" : "audit bad"}>
        <div className="audit-head">
          <span className="status">{audit.ok ? "VERIFIED" : "MISMATCH"}</span>
          <h2>The audit</h2>
        </div>

        {audit.error ? (
          <p className="detail">{audit.error}</p>
        ) : (
          <>
            <p className="detail">
              The chain holds one commitment for everything the building received. Opening it
              to the published total, and recomputing the commitment from that total, gives
              back the point the chain already stores — which it could not, if the building
              had overstated or understated by a single stroop.
            </p>
            <dl className="numbers">
              <div>
                <dt>Building says it collected</dt>
                <dd>{xlm(audit.published)}</dd>
              </div>
              <div>
                <dt>Chain&rsquo;s commitment opens to</dt>
                <dd className={audit.ok ? "" : "wrong"}>{xlm(audit.reconstructed)}</dd>
              </div>
            </dl>
            <div className="commits">
              <div>
                <span className="k">commitment on-chain</span>
                <code>{audit.onchainCommitment.slice(0, 48)}…</code>
              </div>
              <div>
                <span className="k">recomputed from the total</span>
                <code>{audit.recomputedCommitment.slice(0, 48)}…</code>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="explain">
        <h3>Why this works</h3>
        <p>
          A Pedersen commitment to a value <code>v</code> with blinding <code>r</code> is the
          curve point <code>v·G + r·H</code>. Add two of them and you get{" "}
          <code>(v₁+v₂)·G + (r₁+r₂)·H</code> — a commitment to the <em>sum</em>, with nothing
          in it that identifies either term.
        </p>
        <p>
          So when eight payments land in the building&rsquo;s balance, the chain ends up
          holding a commitment to their total without ever having held one to any single
          payment. The building opens the total. The line items stay shut.
        </p>
        <div className={homo.matches ? "proof ok" : "proof bad"}>
          <span className="k">Split the total two ways, commit to each half, add the points:</span>
          <code>{homo.a.slice(0, 26)}… + {homo.b.slice(0, 26)}…</code>
          <span className="k">equals a commitment to the whole:</span>
          <code>{homo.sum.slice(0, 26)}…</code>
          <span className="verdict">{homo.matches ? "✓ identical" : "✗ mismatch"}</span>
        </div>
        <p className="aside">
          A normal ledger makes you pick: an auditable total, or private line items. This is
          both, and the second page shows what happens when the archive serving that history
          decides to lie.
        </p>
      </section>

      <footer>
        <p>
          <Link href="/">← Don&rsquo;t trust your indexer. Verify it.</Link>
        </p>
        <p>
          <a href="https://github.com/aguilar1x/stellar-confidential-token-sdk">Source</a>
          {" · "}
          <a href="https://www.npmjs.com/package/stellar-confidential-token-sdk">npm</a>
        </p>
        <p className="aside">
          Reproduce it: <code>node examples/condominium.mjs</code>. Testnet only, not audited.
        </p>
      </footer>
    </main>
  );
}
