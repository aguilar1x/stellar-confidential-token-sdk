/**
 * Node entry point: ingest from Soroban RPC on a timer, serve INDEXER.md.
 *
 * The handler itself is a Web-standard `fetch` function, so this file is only
 * the Node adapter. A Cloudflare Worker or Deno deployment imports the same
 * handler and skips everything here, which is how two independent endpoints
 * (INDEXER.md §7) stay behaviourally identical instead of drifting.
 *
 * Env:
 *   PORT               default 8787
 *   RPC_URL            default https://soroban-testnet.stellar.org
 *   TOKEN_CONTRACT_ID  required, the confidential-token contract to index
 *   POLL_SECONDS       default 10
 */

import { createServer } from "node:http";
import { rpc } from "@stellar/stellar-sdk";

import { MemoryStore } from "./store.js";
import { createHandler } from "./handler.js";
import { ingestFromRpc } from "./ingest.js";

const PORT = Number(process.env.PORT ?? 8787);
const RPC_URL = process.env.RPC_URL ?? "https://soroban-testnet.stellar.org";
const CONTRACT = process.env.TOKEN_CONTRACT_ID;
const POLL_SECONDS = Number(process.env.POLL_SECONDS ?? 10);
const FROM_LEDGER = Number(process.env.FROM_LEDGER ?? 0);

if (!CONTRACT) {
  console.error("TOKEN_CONTRACT_ID is required");
  process.exit(1);
}

const store = new MemoryStore();
const handler = createHandler({ store });
const server = new rpc.Server(RPC_URL, { allowHttp: RPC_URL.startsWith("http://") });

/** Resume from the ledger after the last one ingested, or from the start. */
async function poll() {
  try {
    const from = store.ingestedThrough() ? store.ingestedThrough() + 1 : FROM_LEDGER;
    const res = await ingestFromRpc({ server, store, contractId: CONTRACT, fromLedger: from });
    if (res.ingested > 0) {
      console.log(`ingested ${res.ingested} event(s) over ledgers ${res.from}..${res.to}`);
    }
  } catch (e) {
    // Never let a transient RPC failure kill the loop: a stalled indexer that
    // keeps serving is fine, because C3/C4 tell clients exactly how stale it is.
    console.error(`ingest failed: ${e?.message ?? e}`);
  }
}

createServer(async (req, res) => {
  const url = `http://${req.headers.host ?? "localhost"}${req.url}`;
  try {
    const response = await handler(new Request(url, { method: req.method }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: String(e?.message ?? e) }));
  }
}).listen(PORT, () => {
  console.log(`indexer on :${PORT}, contract ${CONTRACT}, rpc ${RPC_URL}`);
});

await poll();
setInterval(poll, POLL_SECONDS * 1000);
