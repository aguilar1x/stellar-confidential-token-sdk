/**
 * INDEXER.md client conformance tests.
 *
 * The central property under test is C3. An indexer that serves a partial
 * history without saying so makes a client reconstruct a wrong balance with no
 * signal at all, so `complete` must be honoured — including when it is absent,
 * which is itself non-conformant and must not be read as "fine".
 *
 * Decoding parity with the RPC path is asserted by round-tripping real XDR
 * through both decoders.
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import { Address, xdr } from "@stellar/stellar-sdk";

import {
  IndexerV1Client,
  IncompleteHistoryError,
  decodeIndexerRow,
  type IndexerEventRow,
} from "./indexer-v1.js";

const CONTRACT = "CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const ACCOUNT = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

/** Build a real `merge` event row: topics [sym("merge"), addr], empty data map. */
function mergeRow(ledger: number, eventIndex = 0): IndexerEventRow {
  return {
    ledger_seq: ledger,
    tx_hash: `tx${ledger}`,
    event_index: eventIndex,
    operation_index: 0,
    topics_xdr: [
      xdr.ScVal.scvSymbol("merge").toXDR("base64"),
      new Address(ACCOUNT).toScVal().toXDR("base64"),
    ],
    data_xdr: xdr.ScVal.scvMap([]).toXDR("base64"),
  };
}

function mockFetch(handler: (url: string) => { status?: number; body: unknown }) {
  const fn = vi.fn(async (url: string) => {
    const { status = 200, body } = handler(String(url));
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

const client = new IndexerV1Client({ baseUrl: "https://idx.test", label: "idx-a" });

describe("C4 · ingestion status", () => {
  it("reads the ingestion status fields", async () => {
    mockFetch(() => ({
      body: {
        latest_ledger: 5000,
        ingested_through: 4990,
        ingested_from: 100,
        lag_seconds: 55,
      },
    }));
    expect(await client.health()).toEqual({
      latestLedger: 5000,
      ingestedThrough: 4990,
      ingestedFrom: 100,
      lagSeconds: 55,
    });
  });

  it("defaults ingestedFrom to 0 when an archive omits it", async () => {
    // Unlike C3's completeness flag, silence here is safe to default: a floor
    // of zero makes a client ask for MORE than the archive covers, which draws
    // an honest `complete: false` rather than a false sense of coverage.
    mockFetch(() => ({ body: { latest_ledger: 10, ingested_through: 10 } }));
    expect((await client.health()).ingestedFrom).toBe(0);
  });

  it("hits the spec's path", async () => {
    const fn = mockFetch(() => ({ body: {} }));
    await client.health();
    expect(fn.mock.calls[0]![0]).toBe("https://idx.test/v1/health");
  });
});

describe("C2 · ordered history", () => {
  it("requests the spec's path and query parameters", async () => {
    const fn = mockFetch(() => ({ body: { events: [], cursor: null, complete: true } }));
    await client.orderedHistory({
      contractId: CONTRACT,
      account: ACCOUNT,
      fromLedger: 10,
      toLedger: 99,
      types: ["merge", "transfer"],
      limit: 50,
    });
    const url = new URL(String(fn.mock.calls[0]![0]));
    expect(url.pathname).toBe(`/v1/tokens/${CONTRACT}/accounts/${ACCOUNT}/events`);
    expect(url.searchParams.get("from_ledger")).toBe("10");
    expect(url.searchParams.get("to_ledger")).toBe("99");
    expect(url.searchParams.get("types")).toBe("merge,transfer");
    expect(url.searchParams.get("limit")).toBe("50");
  });

  it("decodes rows and preserves ledger order across pages", async () => {
    mockFetch((url) => {
      const cursor = new URL(url).searchParams.get("cursor");
      if (!cursor) {
        return { body: { events: [mergeRow(10), mergeRow(11)], cursor: "c1", complete: true } };
      }
      return { body: { events: [mergeRow(12)], cursor: null, complete: true } };
    });

    const { events, complete } = await client.fetchEvents({
      contractId: CONTRACT,
      account: ACCOUNT,
      fromLedger: 0,
    });
    expect(complete).toBe(true);
    expect(events.map((e) => e.ledger)).toEqual([10, 11, 12]);
    expect(events.every((e) => e.type === "merge")).toBe(true);
  });

  it("stops paging when the cursor stops advancing", async () => {
    // A buggy indexer that always returns the same cursor must not hang us.
    mockFetch(() => ({ body: { events: [mergeRow(7)], cursor: "same", complete: true } }));
    const { events } = await client.fetchEvents(
      { contractId: CONTRACT, account: ACCOUNT, fromLedger: 0, cursor: "same" },
      false,
    );
    expect(events).toHaveLength(1);
  });
});

describe("C3 · completeness is load-bearing", () => {
  it("refuses an incomplete range rather than replaying a partial history", async () => {
    mockFetch(() => ({ body: { events: [mergeRow(10)], cursor: null, complete: false } }));
    await expect(
      client.fetchEvents({ contractId: CONTRACT, account: ACCOUNT, fromLedger: 0 }),
    ).rejects.toThrow(IncompleteHistoryError);
  });

  it("names the offending indexer, so a two-endpoint setup is diagnosable", async () => {
    mockFetch(() => ({ body: { events: [], cursor: null, complete: false } }));
    await expect(
      client.fetchEvents({ contractId: CONTRACT, account: ACCOUNT, fromLedger: 0 }),
    ).rejects.toThrow(/idx-a/);
  });

  it("treats a MISSING complete flag as not-complete, never as fine", async () => {
    // C3 is REQUIRED; an indexer that omits it is non-conformant and silence
    // is the one reading that cannot cause a wrong balance to be trusted.
    mockFetch(() => ({ body: { events: [mergeRow(10)], cursor: null } }));
    const page = await client.orderedHistory({
      contractId: CONTRACT,
      account: ACCOUNT,
      fromLedger: 0,
    });
    expect(page.complete).toBe(false);
    await expect(
      client.fetchEvents({ contractId: CONTRACT, account: ACCOUNT, fromLedger: 0 }),
    ).rejects.toThrow(IncompleteHistoryError);
  });

  it("one incomplete page taints the whole multi-page range", async () => {
    mockFetch((url) => {
      const cursor = new URL(url).searchParams.get("cursor");
      if (!cursor) {
        return { body: { events: [mergeRow(10)], cursor: "c1", complete: true } };
      }
      return { body: { events: [mergeRow(11)], cursor: null, complete: false } };
    });
    await expect(
      client.fetchEvents({ contractId: CONTRACT, account: ACCOUNT, fromLedger: 0 }),
    ).rejects.toThrow(IncompleteHistoryError);
  });

  it("can be opted out of explicitly, and then reports complete: false", async () => {
    mockFetch(() => ({ body: { events: [mergeRow(10)], cursor: null, complete: false } }));
    const res = await client.fetchEvents(
      { contractId: CONTRACT, account: ACCOUNT, fromLedger: 0 },
      false,
    );
    expect(res.complete).toBe(false);
    expect(res.events).toHaveLength(1);
  });
});

describe("C1 · checkpoint (optional)", () => {
  it("returns null when the indexer holds no checkpoint", async () => {
    mockFetch(() => ({ body: { event: null, complete: true } }));
    expect(await client.checkpoint(CONTRACT, ACCOUNT, 500)).toEqual({
      event: null,
      complete: true,
    });
  });

  it("passes at_ledger and decodes the event", async () => {
    const fn = mockFetch(() => ({ body: { event: mergeRow(42), complete: true } }));
    const res = await client.checkpoint(CONTRACT, ACCOUNT, 500);
    expect(new URL(String(fn.mock.calls[0]![0])).searchParams.get("at_ledger")).toBe("500");
    expect(res.event?.ledger).toBe(42);
  });
});

describe("decoding", () => {
  it("ignores event families outside the confidential-token set", async () => {
    const foreign: IndexerEventRow = {
      ...mergeRow(1),
      topics_xdr: [xdr.ScVal.scvSymbol("approve").toXDR("base64")],
    };
    expect(decodeIndexerRow(foreign)).toBeNull();
  });

  it("produces the same cursor an RPC-sourced event would carry", () => {
    // naturalEventId is source-independent, which is what lets the hybrid
    // source dedupe an indexer event against its RPC twin.
    const ev = decodeIndexerRow(mergeRow(77, 3))!;
    expect(ev.cursor).toContain("77");
    expect(decodeIndexerRow(mergeRow(77, 3))!.cursor).toBe(ev.cursor);
    expect(decodeIndexerRow(mergeRow(77, 4))!.cursor).not.toBe(ev.cursor);
  });

  it("surfaces a non-2xx as an error naming the indexer", async () => {
    mockFetch(() => ({ status: 503, body: {} }));
    await expect(client.health()).rejects.toThrow(/idx-a.*503/);
  });
});
