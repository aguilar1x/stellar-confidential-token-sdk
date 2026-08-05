import { headers } from "next/headers";

import { ARCHIVES, DEMO, EXPLORER } from "@/lib/demo";
import { judge, type Verdict } from "./verdicts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const xlm = (stroops: string) =>
  `${(Number(stroops) / 10_000_000).toLocaleString("en-US", { maximumFractionDigits: 7 })} XLM`;

export default async function Page() {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;

  const verdicts: Verdict[] = [];
  for (const a of ARCHIVES) {
    try {
      verdicts.push(await judge(a.id, origin));
    } catch (e) {
      verdicts.push({
        archive: a.id,
        accepted: false,
        caughtBy: null,
        detail: `could not run: ${(e as Error)?.message ?? e}`,
      });
    }
  }

  const believed = verdicts.filter((v) => v.accepted).length;

  return (
    <main>
      <header>
        <p className="eyebrow">Confidential Tokens · Stellar testnet</p>
        <h1>Don&rsquo;t trust your indexer. Verify it.</h1>
        <p className="lede">
          A confidential balance lives on-chain as a <em>commitment</em>. Only your wallet
          holds the <em>opening</em> that can spend it — and to rebuild that opening after
          reinstalling, your wallet has to replay history from an archive it did not write.
          So: what happens when the archive lies?
        </p>
        <p className="lede">
          Below, one real account&rsquo;s history is served by four archives. Three of them
          are dishonest, in three different ways. The same client reads all four.
        </p>
      </header>

      <section className="verdicts">
        {ARCHIVES.map((a) => {
          const v = verdicts.find((x) => x.archive === a.id)!;
          return (
            <article key={a.id} className={v.accepted ? "card ok" : "card bad"}>
              <div className="card-head">
                <span className="status">{v.accepted ? "ACCEPTED" : "REJECTED"}</span>
                <h2>{a.title}</h2>
                {v.caughtBy && !v.accepted && <span className="layer">caught by {v.caughtBy}</span>}
              </div>
              <p className="blurb">{a.blurb}</p>
              <p className="detail">{v.detail}</p>

              {v.reported && v.truth && (
                <dl className="numbers">
                  <div>
                    <dt>It reported</dt>
                    <dd className={v.reported.spendable !== v.truth.spendable ? "wrong" : ""}>
                      spendable {xlm(v.reported.spendable)}
                    </dd>
                    <dd className={v.reported.receiving !== v.truth.receiving ? "wrong" : ""}>
                      receiving {xlm(v.reported.receiving)}
                    </dd>
                  </div>
                  <div>
                    <dt>The chain says</dt>
                    <dd>spendable {xlm(v.truth.spendable)}</dd>
                    <dd>receiving {xlm(v.truth.receiving)}</dd>
                  </div>
                </dl>
              )}
            </article>
          );
        })}
      </section>

      <section className="explain">
        <h3>Two defences, and the difference between them matters</h3>
        <p>
          The <strong>lagging</strong> archive is caught by <code>INDEXER.md</code> C3, the
          completeness signal — it admits the gap itself, and the client refuses to replay a
          partial history at all.
        </p>
        <p>
          The other two <strong>lie</strong>. They claim <code>complete: true</code>, so C3
          cannot help: a completeness flag is only as good as the party asserting it. They are
          caught because the client re-derives its openings and checks them against the
          commitments the chain holds (<code>§7</code>). That check is what makes an indexer
          untrusted rather than merely monitored.
        </p>
        <p className="aside">
          Note the corrupting archive: wrong by a single stroop, and still refused. The
          check is exact, not approximate.
        </p>
      </section>

      <section className="provenance">
        <h3>This is real</h3>
        <p>
          The account below transacted on Stellar testnet. Its confidential secret is{" "}
          <em>derived</em> per <code>SDK.md §5.1</code> and stored nowhere. The 40 XLM transfer
          amount does not appear on-chain — the recipient decrypts it from public events.
        </p>
        <ol className="history">
          {DEMO.history.map((h) => (
            <li key={h.tx}>
              <span>{h.step}</span>
              <a href={`${EXPLORER}/${h.tx}`} target="_blank" rel="noreferrer">
                {h.tx.slice(0, 16)}…
              </a>
            </li>
          ))}
        </ol>
        <p className="aside">
          The demo account&rsquo;s seed is published in the source. It is testnet and holds
          nothing — the page runs the real client, and the real client needs a real signer.
        </p>
      </section>

      <footer>
        <p>
          {believed === 1 ? "One archive was believed. It was the one that was checked." : null}
        </p>
        <p>
          <a href="https://github.com/aguilar1x/stellar-confidential-token-sdk">Source</a>
          {" · "}
          <a href="https://www.npmjs.com/package/stellar-confidential-token-sdk">npm</a>
          {" · "}
          <a href="https://github.com/OpenZeppelin/stellar-contracts/blob/main/packages/tokens/src/confidential/docs/INDEXER.md">
            INDEXER.md
          </a>
        </p>
        <p className="aside">
          Break it yourself: <code>node examples/sabotage.mjs</code>. Testnet only, not audited.
        </p>
      </footer>
    </main>
  );
}
