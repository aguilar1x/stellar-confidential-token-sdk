/**
 * Round-trip conformance: the SDK's INDEXER.md client talking to this service.
 *
 * Each side was written against the specification independently, the client
 * against what it must consume, the service against what it must serve. A test
 * that only exercised one side would pass with both wrong in the same way, so
 * the meaningful check is that they interoperate over real HTTP shapes without
 * either knowing about the other.
 *
 * The completeness cases carry the weight. It is easy to serve `complete: true`
 * unconditionally and look perfect; the tests below build stores with real gaps
 * and assert the client refuses them.
 */

import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { Address, xdr } from "@stellar/stellar-sdk";

import { IndexerV1Client, IncompleteHistoryError } from "stellar-confidential-token-sdk/chain";

import { MemoryStore } from "../src/store.js";
import { createHandler } from "../src/handler.js";

const CONTRACT = "CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const ALICE = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
const BOB = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

function mergeEvent(ledger, account, eventIndex = 0) {
  return {
    contract_id: CONTRACT,
    event_name: "merge",
    ledger_seq: ledger,
    tx_hash: `tx-${ledger}-${eventIndex}`,
    operation_index: 0,
    event_index: eventIndex,
    topics_xdr: [
      xdr.ScVal.scvSymbol("merge").toXDR("base64"),
      new Address(account).toScVal().toXDR("base64"),
    ],
    data_xdr: xdr.ScVal.scvMap([]).toXDR("base64"),
    participants: [account],
  };
}

/** Wire the client's global fetch straight into the handler, no socket needed. */
function connect(handler) {
  vi.stubGlobal("fetch", (input) => handler(new Request(String(input))));
  return new IndexerV1Client({ baseUrl: "https://archive.test", label: "archive-a" });
}

let store;
let client;

beforeEach(() => {
  store = new MemoryStore();
  client = connect(createHandler({ store }));
});
afterEach(() => vi.unstubAllGlobals());

describe("C4 · ingestion status", () => {
  it("reports what has been ingested and the resulting lag", async () => {
    store.ingest([mergeEvent(100, ALICE)], 1, 100, 120);
    const health = await client.health();
    expect(health.ingestedThrough).toBe(100);
    expect(health.latestLedger).toBe(120);
    expect(health.lagSeconds).toBeGreaterThan(0);
  });

  it("is honest about holding nothing", async () => {
    expect(await client.health()).toEqual({
      latestLedger: 0,
      ingestedThrough: 0,
      ingestedFrom: 0,
      lagSeconds: 0,
    });
  });

  it("publishes the floor of what it can answer for", async () => {
    // An archive built by scanning an RPC starts above genesis. Without this,
    // a client asking from ledger one gets `complete: false` from a perfectly
    // faithful archive and cannot tell that apart from a real gap.
    store.ingest([mergeEvent(3400, ALICE)], 3000, 4000, 4000);
    const health = await client.health();
    expect(health.ingestedFrom).toBe(3000);
    expect(health.ingestedThrough).toBe(4000);

    const { events, complete } = await client.fetchEvents({
      contractId: CONTRACT,
      account: ALICE,
      fromLedger: health.ingestedFrom,
      toLedger: health.ingestedThrough,
    });
    expect(complete).toBe(true);
    expect(events.map((e) => e.ledger)).toEqual([3400]);
  });
});

describe("C2 · ordered history", () => {
  beforeEach(() => {
    store.ingest(
      [mergeEvent(10, ALICE), mergeEvent(30, ALICE), mergeEvent(20, ALICE), mergeEvent(15, BOB)],
      1,
      100,
      100,
    );
  });

  it("serves one account's events in total order", async () => {
    const { events } = await client.fetchEvents({
      contractId: CONTRACT,
      account: ALICE,
      fromLedger: 0,
      toLedger: 100,
    });
    expect(events.map((e) => e.ledger)).toEqual([10, 20, 30]);
  });

  it("scopes to the account, Bob's history is not Alice's", async () => {
    const { events } = await client.fetchEvents({
      contractId: CONTRACT,
      account: BOB,
      fromLedger: 0,
      toLedger: 100,
    });
    expect(events.map((e) => e.ledger)).toEqual([15]);
  });

  it("honours the ledger range", async () => {
    const { events } = await client.fetchEvents({
      contractId: CONTRACT,
      account: ALICE,
      fromLedger: 16,
      toLedger: 25,
    });
    expect(events.map((e) => e.ledger)).toEqual([20]);
  });

  it("pages without dropping or repeating an event", async () => {
    const { events } = await client.fetchEvents({
      contractId: CONTRACT,
      account: ALICE,
      fromLedger: 0,
      toLedger: 100,
      limit: 1,
    });
    expect(events.map((e) => e.ledger)).toEqual([10, 20, 30]);
    expect(new Set(events.map((e) => e.cursor)).size).toBe(3);
  });

  it("filters by type", async () => {
    const { events } = await client.fetchEvents({
      contractId: CONTRACT,
      account: ALICE,
      fromLedger: 0,
      toLedger: 100,
      types: ["transfer"],
    });
    expect(events).toHaveLength(0);
  });

  it("decodes into the SDK's event shape", async () => {
    const { events } = await client.fetchEvents({
      contractId: CONTRACT,
      account: ALICE,
      fromLedger: 0,
      toLedger: 100,
    });
    expect(events[0].type).toBe("merge");
    expect(events[0].account).toBe(ALICE);
    expect(events[0].txHash).toBe("tx-10-0");
  });
});

describe("C3 · completeness, end to end", () => {
  it("serves complete: true only for a range it actually examined", async () => {
    store.ingest([mergeEvent(50, ALICE)], 1, 100, 100);
    const page = await client.orderedHistory({
      contractId: CONTRACT,
      account: ALICE,
      fromLedger: 1,
      toLedger: 100,
    });
    expect(page.complete).toBe(true);
  });

  it("an empty-but-examined range is complete, not a gap", async () => {
    // Nothing happened between ledgers 1 and 100. That is a fact the indexer
    // can vouch for, and it must not be confused with never having looked.
    store.ingest([], 1, 100, 100);
    const page = await client.orderedHistory({
      contractId: CONTRACT,
      account: ALICE,
      fromLedger: 1,
      toLedger: 100,
    });
    expect(page.events).toHaveLength(0);
    expect(page.complete).toBe(true);
  });

  it("REFUSES a range the indexer never examined", async () => {
    store.ingest([mergeEvent(50, ALICE)], 1, 100, 100);
    // Ledgers 101..200 were never scanned.
    await expect(
      client.fetchEvents({ contractId: CONTRACT, account: ALICE, fromLedger: 1, toLedger: 200 }),
    ).rejects.toThrow(IncompleteHistoryError);
  });

  it("REFUSES a range with a hole in the middle", async () => {
    // This is the dangerous shape: events on both sides, nothing to suggest
    // anything is missing, and a silently wrong balance if replayed.
    store.ingest([mergeEvent(10, ALICE)], 1, 50, 300);
    store.ingest([mergeEvent(250, ALICE)], 200, 300, 300);
    expect(store.isComplete(1, 300)).toBe(false);

    await expect(
      client.fetchEvents({ contractId: CONTRACT, account: ALICE, fromLedger: 1, toLedger: 300 }),
    ).rejects.toThrow(IncompleteHistoryError);

    // Either side on its own is still trustworthy.
    const left = await client.fetchEvents({
      contractId: CONTRACT,
      account: ALICE,
      fromLedger: 1,
      toLedger: 50,
    });
    expect(left.complete).toBe(true);
  });

  it("treats adjacent ingested ranges as gap-free", async () => {
    store.ingest([mergeEvent(10, ALICE)], 1, 100, 200);
    store.ingest([mergeEvent(150, ALICE)], 101, 200, 200);
    const { events, complete } = await client.fetchEvents({
      contractId: CONTRACT,
      account: ALICE,
      fromLedger: 1,
      toLedger: 200,
    });
    expect(complete).toBe(true);
    expect(events.map((e) => e.ledger)).toEqual([10, 150]);
  });
});

describe("C1 · checkpoint", () => {
  it("returns the latest merge at or before the requested ledger", async () => {
    store.ingest([mergeEvent(10, ALICE), mergeEvent(90, ALICE)], 1, 100, 100);
    const res = await client.checkpoint(CONTRACT, ALICE, 50);
    expect(res.event?.ledger).toBe(10);
    expect((await client.checkpoint(CONTRACT, ALICE, 100)).event?.ledger).toBe(90);
  });

  it("returns null when there is no checkpoint yet", async () => {
    store.ingest([], 1, 100, 100);
    expect((await client.checkpoint(CONTRACT, ALICE, 100)).event).toBeNull();
  });
});

describe("hostile inputs", () => {
  it("404s an unknown route rather than guessing", async () => {
    const handler = createHandler({ store });
    expect((await handler(new Request("https://x.test/v1/nope"))).status).toBe(404);
  });

  it("rejects a non-numeric ledger bound", async () => {
    const handler = createHandler({ store });
    const res = await handler(
      new Request(`https://x.test/v1/tokens/${CONTRACT}/accounts/${ALICE}/events?from_ledger=abc`),
    );
    expect(res.status).toBe(400);
  });

  it("caps an absurd page limit", async () => {
    store.ingest(
      Array.from({ length: 50 }, (_, i) => mergeEvent(i + 1, ALICE)),
      1,
      100,
      100,
    );
    const handler = createHandler({ store });
    const res = await handler(
      new Request(
        `https://x.test/v1/tokens/${CONTRACT}/accounts/${ALICE}/events?from_ledger=0&limit=999999`,
      ),
    );
    expect((await res.json()).events.length).toBeLessThanOrEqual(500);
  });

  it("allows cross-origin reads, since browser wallets need them", async () => {
    const handler = createHandler({ store });
    const res = await handler(new Request("https://x.test/v1/health"));
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
