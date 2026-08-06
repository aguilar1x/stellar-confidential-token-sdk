/**
 * Cloudflare Workers / Deno Deploy entry point.
 *
 * The handler is already a Web-standard `fetch` function, so this adapter only
 * has to do one thing the Node server does differently: a Worker isolate keeps
 * no memory between cold starts, so the archive re-ingests on first request
 * rather than on a timer.
 *
 * That is affordable only because the scan window is pinned. Ingesting from the
 * RPC's retention floor would examine ~120,000 ledgers on every cold start;
 * scanning from FROM_LEDGER takes a fraction of a second. Set it near the
 * history the deployment actually serves.
 *
 * Env:
 *   TOKEN_CONTRACT_ID  required
 *   RPC_URL            default https://soroban-testnet.stellar.org
 *   FROM_LEDGER        default 0 (the retention floor, slow; pin it)
 */

import { rpc } from "@stellar/stellar-sdk";

import { MemoryStore } from "./store.js";
import { createHandler } from "./handler.js";
import { ingestFromRpc } from "./ingest.js";

/**
 * Cached per isolate. Concurrent requests during a cold start share one
 * ingestion rather than each launching their own. The promise is stored, not
 * the result.
 */
let ingestion = null;

function ingestOnce(env) {
  ingestion ??= (async () => {
    const store = new MemoryStore();
    const server = new rpc.Server(env.RPC_URL ?? "https://soroban-testnet.stellar.org");
    await ingestFromRpc({
      server,
      store,
      contractId: env.TOKEN_CONTRACT_ID,
      fromLedger: Number(env.FROM_LEDGER ?? 0),
    });
    return store;
  })().catch((e) => {
    // A transient RPC failure must not pin the isolate into a broken state for
    // the rest of its life.
    ingestion = null;
    throw e;
  });
  return ingestion;
}

export default {
  async fetch(request, env) {
    if (!env?.TOKEN_CONTRACT_ID) {
      return Response.json({ error: "TOKEN_CONTRACT_ID is not configured" }, { status: 500 });
    }
    try {
      const store = await ingestOnce(env);
      return createHandler({ store })(request);
    } catch (e) {
      // 503 rather than 500: the archive is temporarily unable to answer, which
      // is exactly what a client's C3/C4 handling is built to cope with.
      return Response.json({ error: String(e?.message ?? e) }, { status: 503 });
    }
  },
};
