# Deploying

Two things get deployed: the demo page, and the archive it reads from.

`INDEXER.md` §7 says wallets "SHOULD support multiple independent archive
endpoints, with deployments running or contracting at least two". Independent
means different operators — two instances on one provider share an outage, and
sharing an outage is the failure the requirement exists to prevent. So the
archive goes somewhere other than the page.

The archive is a Web-standard `fetch` handler, so the same code runs on
Cloudflare, Deno Deploy, Vercel or plain Node. Only the entry file differs.

---

## The page → Vercel

The repository is a monorepo, so Vercel needs to be told which directory the app
lives in. Everything else is default.

1. **New Project** → import `aguilar1x/stellar-confidential-token-sdk`
2. **Root Directory**: `apps/web`
3. Deploy.

No environment variables are required — the demo account and contract IDs are
committed in `apps/web/lib/demo.ts`, deliberately, since they are testnet
values that hold nothing.

Optional, if the page should read a remote archive instead of serving its own:

| Variable | Meaning |
|---|---|
| `INDEX_FROM_LEDGER` | First ledger the built-in archives scan. Defaults to `3976100`, just below the demo account's history. |

### Why the ledger floor is pinned

Serverless functions keep no memory between cold starts, so the archive can
re-ingest on a page load. Scanning from the RPC's retention floor examines about
120,000 ledgers to find the same fifteen events — roughly two seconds, growing
daily. Scanning from the pinned floor takes about a third of a second and stays
constant.

This does not overstate coverage: the archive reports the floor as
`ingested_from`, and a client asking for earlier history is truthfully told the
range is not covered.

---

## The archive → Cloudflare Workers

Free, and enough for this by a wide margin: 100,000 requests a day. The Worker
serves JSON and does one short RPC scan per cold start.

```bash
cd apps/indexer
npx wrangler login     # opens a browser once, to authorise the CLI
npx wrangler deploy
```

That is the whole setup. `wrangler.toml` is committed with the contract id, the
RPC URL and the pinned ledger floor already set, and the bundle has been checked
to build (169 KB gzipped, against a 3 MB limit).

Deploying prints a URL like
`https://confidential-token-archive.<your-subdomain>.workers.dev`. Verify it:

```bash
curl https://confidential-token-archive.<subdomain>.workers.dev/v1/health
# {"latest_ledger":…,"ingested_through":…,"ingested_from":3976100,"lag_seconds":…}
```

To change the indexed contract without editing the file:

```bash
npx wrangler deploy --var TOKEN_CONTRACT_ID:<contract> --var FROM_LEDGER:<ledger>
```

### Alternative: Deno Deploy

Same file, no CLI. Connect the GitHub repository at
[dash.deno.com](https://dash.deno.com), set the entry point to
`apps/indexer/src/worker.js`, and add `TOKEN_CONTRACT_ID` and `FROM_LEDGER` as
environment variables. Also free.

Either is fine. What matters for §7 is that it is **not** the provider hosting
the page.

---

## Plain Node

For a host that keeps a process alive — a VM, Fly.io, Render — use the Node
entry instead. It ingests on a timer rather than on first request, so requests
never wait on a scan:

```bash
cd apps/indexer
TOKEN_CONTRACT_ID=CAPLH4ZW7EDSYRBCQN77Y4K7W5RNA6TO76JQ5CGHHIPY4ALWVQZ2WFAY \
FROM_LEDGER=3976100 \
PORT=8787 \
npm start
```

---

## Checking a deployment is actually conformant

Point the real client at it. This is the same check `apps/indexer`'s round-trip
tests run, against a live URL:

```bash
node -e '
import("stellar-confidential-token-sdk/chain").then(async ({ IndexerV1Client }) => {
  const c = new IndexerV1Client({ baseUrl: process.argv[1], label: "deployed" });
  const h = await c.health();
  console.log("C4:", h);
  const { events, complete } = await c.fetchEvents({
    contractId: "CAPLH4ZW7EDSYRBCQN77Y4K7W5RNA6TO76JQ5CGHHIPY4ALWVQZ2WFAY",
    account: "GDPKVZUNM2G632S53NBYB5PLERIYNBDKXC3GAO2LNHRVQDVGKNQWLAUK",
    fromLedger: h.ingestedFrom,
    toLedger: h.ingestedThrough,
  });
  console.log("C2:", events.length, "events | C3 complete:", complete);
});' https://your-archive-url
```

A conformant deployment answers all three. If `fetchEvents` throws
`IncompleteHistoryError`, the archive is telling you it has a gap — which is C3
working, not a bug.
