/**
 * INDEXER.md HTTP surface, as a Web-standard `fetch` handler.
 *
 * Written against Request/Response so one implementation serves from Node,
 * Cloudflare Workers, Deno or Vercel unchanged. INDEXER.md §7 asks deployments
 * to run at least two independent archive endpoints; making the runtime a
 * deployment detail is what keeps those two from drifting apart in behaviour.
 *
 * Routes (INDEXER.md §4):
 *   GET /v1/health
 *   GET /v1/tokens/{contract_id}/accounts/{account}/events
 *   GET /v1/tokens/{contract_id}/accounts/{account}/checkpoint
 */

/** Stellar ledger sequences start at 1; there is no ledger 0. */
const FIRST_LEDGER = 1;

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 200;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // A browser wallet must be able to reach an archive on another origin.
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });

const badRequest = (message) => json({ error: message }, 400);

function serializeEvent(ev) {
  return {
    ledger_seq: ev.ledger_seq,
    tx_hash: ev.tx_hash,
    event_index: ev.event_index,
    operation_index: ev.operation_index,
    topics_xdr: ev.topics_xdr,
    data_xdr: ev.data_xdr,
  };
}

/**
 * @param {object} deps
 * @param {import("./store.js").MemoryStore} deps.store
 * @param {() => number} [deps.now] seconds provider, for deterministic tests
 * @param {(ev: object) => object} [deps.transform] hook used ONLY by the
 *   tamper demo to serve deliberately corrupted rows; absent in real
 *   deployments.
 */
export function createHandler({ store, now, transform }) {
  const asServed = transform ?? ((ev) => ev);

  return async function handle(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
        },
      });
    }
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405);

    // C4 — ingestion status.
    if (path === "/v1/health") {
      const ingested = store.ingestedThrough();
      const latest = store.latestLedger;
      // Ledgers close about every 5 seconds; a ledger count is the honest
      // measure and seconds are the derived convenience.
      const lag = Math.max(0, latest - ingested) * 5;
      return json({
        latest_ledger: latest,
        ingested_through: ingested,
        // Not named by C4, but a client needs it to pick a range this archive
        // can actually vouch for. See MemoryStore#ingestedFrom.
        ingested_from: store.ingestedFrom(),
        lag_seconds: now ? now() : lag,
      });
    }

    const m = /^\/v1\/tokens\/([^/]+)\/accounts\/([^/]+)\/(events|checkpoint)$/.exec(path);
    if (!m) return json({ error: "not found" }, 404);

    const [, contractId, account, kind] = m;
    const q = url.searchParams;

    if (kind === "checkpoint") {
      const atLedger = Number(q.get("at_ledger") ?? store.ingestedThrough());
      if (!Number.isFinite(atLedger)) return badRequest("at_ledger must be a number");
      const ev = store.checkpoint({ contractId, account, atLedger });
      return json({
        event: ev ? serializeEvent(asServed(ev)) : null,
        complete: store.isComplete(FIRST_LEDGER, atLedger),
      });
    }

    const requestedFrom = Number(q.get("from_ledger") ?? FIRST_LEDGER);
    const toParam = q.get("to_ledger");
    const toLedger = toParam === null ? undefined : Number(toParam);
    if (!Number.isFinite(requestedFrom)) return badRequest("from_ledger must be a number");
    // `from_ledger=0` is how a client says "from the beginning". Stellar ledger
    // sequences start at 1, so raising it to 1 cannot conceal a gap — there is
    // no ledger 0 to have missed. Note this clamp only ever moves the bound UP
    // to the first real ledger; clamping it up to whatever we happen to hold
    // would turn a genuine gap into a confident `complete: true`.
    const fromLedger = Math.max(requestedFrom, FIRST_LEDGER);
    if (toLedger !== undefined && !Number.isFinite(toLedger)) {
      return badRequest("to_ledger must be a number");
    }

    const limit = Math.min(Number(q.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, MAX_LIMIT);
    const types = q.get("types")?.split(",").filter(Boolean);

    const { events, cursor } = store.query({
      contractId,
      account,
      fromLedger,
      toLedger,
      types,
      cursor: q.get("cursor") ?? undefined,
      limit,
    });

    // C3 — completeness is asserted over the REQUESTED range, not over what we
    // happened to return. Clamping to what we hold would make every gap look
    // like an empty range, which is the failure this flag exists to prevent.
    const complete = store.isComplete(fromLedger, toLedger ?? store.ingestedThrough());

    return json({
      events: events.map((ev) => serializeEvent(asServed(ev))),
      cursor,
      complete,
    });
  };
}
