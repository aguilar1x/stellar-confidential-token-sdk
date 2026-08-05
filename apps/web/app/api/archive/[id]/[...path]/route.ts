/**
 * The four archives, served for real.
 *
 * Each is the actual `INDEXER.md` handler from `apps/indexer`, over the actual
 * chain history, differing only in how it serves it. The page then points the
 * actual `IndexerV1Client` at them over HTTP. Nothing here is a fixture or a
 * simulation of a rejection — the client genuinely fetches, genuinely
 * reconstructs, and genuinely refuses three of the four.
 */

import { rpc } from "@stellar/stellar-sdk";

// The indexer is plain JS with JSDoc types; TypeScript reads it directly, so
// these are the same modules `apps/indexer` and the CLI examples run. Importing
// a copy here would let the deployed demo drift from the tested service.
import { MemoryStore } from "../../../../../../indexer/src/store.js";
import { createHandler } from "../../../../../../indexer/src/handler.js";
import { ingestFromRpc } from "../../../../../../indexer/src/ingest.js";
import { dishonestStore } from "../../../../../../indexer/src/tamper.js";

type Store = InstanceType<typeof MemoryStore>;

import { CONTRACTS, INDEX_FROM_LEDGER, RPC_URL, type ArchiveId } from "@/lib/demo";

export const runtime = "nodejs";
// The chain history for a fixed demo account does not change, so ingesting once
// per server lifetime is enough — and keeps a page load from waiting on a full
// RPC scan every time.
export const dynamic = "force-dynamic";

let ingestion: Promise<Store> | null = null;

function ingestOnce() {
  ingestion ??= (async () => {
    const store = new MemoryStore();
    const server = new rpc.Server(RPC_URL);
    await ingestFromRpc({
      server,
      store,
      contractId: CONTRACTS.token,
      fromLedger: INDEX_FROM_LEDGER,
    });
    return store;
  })().catch((e) => {
    // Never cache a failed ingestion: a transient RPC error would otherwise
    // pin the whole demo into a broken state until the server restarts.
    ingestion = null;
    throw e;
  });
  return ingestion;
}

type TamperOptions = Parameters<typeof dishonestStore>[1];

const ADVERSARIES: Record<Exclude<ArchiveId, "honest">, TamperOptions> = {
  lagging: { mode: "honest-gap" },
  omitting: { mode: "omit", eventName: "merge" },
  corrupting: { mode: "corrupt", eventName: "transfer", field: "b_tilde" },
};

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; path: string[] }> },
) {
  const { id, path } = await ctx.params;

  let store: Store;
  try {
    store = await ingestOnce();
  } catch (e) {
    return Response.json(
      { error: `ingestion failed: ${(e as Error)?.message ?? e}` },
      { status: 503 },
    );
  }

  if (id !== "honest") {
    const opts = ADVERSARIES[id as Exclude<ArchiveId, "honest">];
    if (!opts) return Response.json({ error: `unknown archive "${id}"` }, { status: 404 });
    store = dishonestStore(store, opts) as Store;
  }

  // Re-root the request at the path the spec-conformant handler expects; the
  // `/api/archive/{id}` prefix is this deployment's business, not the API's.
  const url = new URL(request.url);
  const inner = new URL(`/${path.join("/")}${url.search}`, url.origin);

  return createHandler({ store })(new Request(inner, { method: "GET" }));
}
