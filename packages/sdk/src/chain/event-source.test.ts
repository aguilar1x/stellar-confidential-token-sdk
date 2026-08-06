/**
 * Offline hybrid event-source tests. `dedupeById` cases are ported from the
 * demo's `test/dedup.mjs`; `hybridFetchEvents` is exercised against a mocked
 * RPC (`getEvents` + `getHealth`) and a mocked indexer, with the indexer both
 * present (backfill) and absent (RPC-only degrade). No network.
 */
import { describe, expect, it } from "vitest";

import { dedupeById, hybridFetchEvents } from "./event-source.js";
import type { ConfidentialEvent } from "./events.js";
import type { ChainClient } from "./client.js";
import type { IndexerClient } from "./indexer.js";

const TOKEN = "CCREDIB3DG3IBVUKBL7QMEK4MTPSTODR7MQ34QY4SQ5LZ5L4WFWNVNXG";

// Minimal events, dedupeById/hybrid only read `.cursor` (id), `.ledger`, type.
const ev = (cursor: string, ledger: number, type = "deposit"): ConfidentialEvent =>
  ({ type, cursor, ledger, txHash: "tx" }) as unknown as ConfidentialEvent;

describe("dedupeById", () => {
  it("collapses duplicate ids, keeps distinct", () => {
    const out = dedupeById([ev("a", 1), ev("a", 1), ev("b", 2)]);
    expect(out).toHaveLength(2);
    expect(out.map((e) => e.cursor).join(",")).toBe("a,b");
  });

  it("stable-sorts by ledger, preserving intra-ledger input order", () => {
    const out = dedupeById([ev("z", 5), ev("a", 2), ev("m", 2)]);
    expect(out.map((e) => `${e.ledger}:${e.cursor}`).join(",")).toBe("2:a,2:m,5:z");
  });

  it("does not re-sort same-ledger ids lexicographically", () => {
    const out = dedupeById([ev("9-2", 9, "deposit"), ev("9-10", 9, "merge")]);
    expect(out.map((e) => e.cursor).join(",")).toBe("9-2,9-10");
  });

  it("dedupes a boundary-overlap event across the seam", () => {
    const old = [ev("00-0", 1), ev("00-1", 2)];
    const recent = [ev("00-1", 2), ev("00-2", 3)]; // "00-1" in both legs
    const out = dedupeById([...old, ...recent]);
    expect(out).toHaveLength(3);
    expect(out.map((e) => e.cursor).join(",")).toBe("00-0,00-1,00-2");
  });

  it("handles empty input", () => {
    expect(dedupeById([])).toHaveLength(0);
  });
});

/** Mock RPC whose `getEvents` returns one page and `getHealth` reports oldest/latest. */
function mockClient(opts: {
  oldestLedger: number;
  latestLedger: number;
  events: ConfidentialEvent[];
  cursor?: string;
}): ChainClient {
  const server = {
    async getHealth() {
      return { oldestLedger: opts.oldestLedger, latestLedger: opts.latestLedger, status: "healthy" };
    },
    async getEvents() {
      // A single page whose cursor ledger is at/after latest, so fetchEvents stops.
      return {
        events: opts.events.map(rpcShape),
        cursor: opts.cursor ?? `${BigInt(opts.latestLedger) << 32n}-0000000000`,
        latestLedger: opts.latestLedger,
      };
    },
  };
  return {
    cfg: { rpcUrl: "http://x", networkPassphrase: "Test", contracts: { token: TOKEN, verifier: TOKEN, auditor: TOKEN } },
    server,
  } as unknown as ChainClient;
}

// fetchEvents runs the real parseEvent, so RPC leg events must be XDR-shaped.
// We keep it simple: return an empty RPC leg for the "indexer backfill" test
// (the indexer leg is what we assert on) and use pre-parsed events elsewhere by
// stubbing getEvents to yield already-typed objects the parser skips. To keep
// parseEvent from choking, RPC-leg events here are unknown-type (skipped).
function rpcShape(_e: ConfidentialEvent): any {
  // An unknown-symbol event: parseEvent returns null and skips it, so the RPC
  // leg contributes nothing, the indexer leg drives the assertions.
  return { id: "0-0", ledger: 0, txHash: "tx", topic: [{ sym: () => ({ toString: () => "noop" }) }], value: {} };
}

function mockIndexer(events: ConfidentialEvent[]): IndexerClient {
  return {
    async fetchEvents() {
      return { events, cursor: undefined, latestLedger: 0 };
    },
  } as unknown as IndexerClient;
}

describe("hybridFetchEvents", () => {
  it("backfills from the indexer below the RPC retention floor", async () => {
    // next (fromLedger=10) < rpcOldest (1000): indexer covers [10, seam-1].
    const client = mockClient({ oldestLedger: 1000, latestLedger: 5000, events: [] });
    const indexer = mockIndexer([ev("10-tx-0-0", 10), ev("20-tx-0-0", 20)]);

    const res = await hybridFetchEvents(client, indexer, { fromLedger: 10 });
    // Indexer leg present; RPC leg parsed to nothing (unknown-type stub).
    expect(res.events.map((e) => e.cursor)).toEqual(["10-tx-0-0", "20-tx-0-0"]);
  });

  it("degrades to RPC-only when no indexer is configured (no throw)", async () => {
    const client = mockClient({ oldestLedger: 1000, latestLedger: 5000, events: [] });
    const res = await hybridFetchEvents(client, undefined, { fromLedger: 4000 });
    // RPC-only cold start; the stubbed RPC leg yields no known events.
    expect(res.events).toHaveLength(0);
    expect(res.latestLedger).toBe(5000);
  });

  it("tolerates an indexer that throws (degrades, keeps the RPC leg)", async () => {
    const client = mockClient({ oldestLedger: 1000, latestLedger: 5000, events: [] });
    const throwingIndexer = {
      async fetchEvents() {
        throw new Error("indexer down");
      },
    } as unknown as IndexerClient;

    const res = await hybridFetchEvents(client, throwingIndexer, { fromLedger: 10 });
    expect(res.events).toHaveLength(0); // backfill failed, RPC leg empty
    expect(res.latestLedger).toBe(5000);
  });
});
