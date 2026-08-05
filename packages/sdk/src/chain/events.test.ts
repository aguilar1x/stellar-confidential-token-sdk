/**
 * Offline event-parse test. Builds synthetic Map-format RPC event responses
 * (the soroban-sdk 26 `#[contractevent]` shape) and drives them through
 * `fetchEvents` with a mocked `rpc.Server.getEvents` — no network. Asserts the
 * typed `ConfidentialEvent` union comes back with the right topics/data, that
 * the RPC cursor→`naturalEventId` normalization holds, that unknown events are
 * skipped, and that pagination follows the returned cursor.
 */
import { describe, expect, it } from "vitest";
import { xdr, Address, Keypair } from "@stellar/stellar-sdk";

import { pointToBytes, scalarMul, H, type Point } from "../crypto/grumpkin.js";
import { toBytes32BE } from "../crypto/field.js";
import { fetchEvents, cursorLedger, naturalEventId } from "./events.js";
import type { ChainClient } from "./client.js";

const TOKEN = "CCREDIB3DG3IBVUKBL7QMEK4MTPSTODR7MQ34QY4SQ5LZ5L4WFWNVNXG";
const NETWORK = "Test SDF Network ; September 2015";
const A = Keypair.random().publicKey();
const B = Keypair.random().publicKey();

const sym = (s: string): xdr.ScVal => xdr.ScVal.scvSymbol(s);
const addrTopic = (g: string): xdr.ScVal => new Address(g).toScVal();
const bytesVal = (b: Uint8Array): xdr.ScVal => xdr.ScVal.scvBytes(Buffer.from(b));
const fieldVal = (v: bigint): xdr.ScVal => bytesVal(toBytes32BE(v));
const pointVal = (p: Point): xdr.ScVal => bytesVal(pointToBytes(p));
const i128Val = (v: bigint): xdr.ScVal =>
  xdr.ScVal.scvI128(
    new xdr.Int128Parts({
      hi: xdr.Int64.fromString((v >> 64n).toString()),
      lo: xdr.Uint64.fromString((v & ((1n << 64n) - 1n)).toString()),
    }),
  );

const dataMapVal = (entries: Record<string, xdr.ScVal>): xdr.ScVal =>
  xdr.ScVal.scvMap(
    Object.entries(entries).map(
      ([k, v]) => new xdr.ScMapEntry({ key: sym(k), val: v }),
    ),
  );

/** A minimal, well-formed `rpc.Api.EventResponse` for the token contract. */
function makeEvent(
  id: string,
  ledger: number,
  txHash: string,
  topics: xdr.ScVal[],
  value: xdr.ScVal,
): any {
  return { id, ledger, txHash, topic: topics, value, contractId: TOKEN, type: "contract" };
}

const rE: Point = scalarMul(42n, H);

const depositEvent = makeEvent(
  "0000000429496729600-0000000001",
  100,
  "aa".repeat(32),
  [sym("deposit"), addrTopic(A), addrTopic(B)],
  dataMapVal({ amount: i128Val(500_000n) }),
);

const transferEvent = makeEvent(
  "0000000433791696896-0000000000",
  101,
  "bb".repeat(32),
  [sym("transfer"), addrTopic(A), addrTopic(B)],
  dataMapVal({
    r_e: pointVal(rE),
    v_tilde: fieldVal(11n),
    sigma: fieldVal(22n),
    b_tilde: fieldVal(33n),
    v_aud_r: fieldVal(44n),
    r_aud_r: fieldVal(55n),
    v_aud_s: fieldVal(66n),
    b_aud_s: fieldVal(77n),
  }),
);

const unknownEvent = makeEvent(
  "0000000433791696896-0000000005",
  101,
  "bb".repeat(32),
  [sym("set_config")],
  dataMapVal({}),
);

/**
 * A ChainClient whose `server.getEvents` replays scripted pages. Only the bits
 * `fetchEvents` touches are stubbed.
 */
function mockClient(pages: { events: any[]; cursor: string; latestLedger: number }[]): ChainClient {
  let i = 0;
  const server = {
    async getEvents() {
      const page = pages[Math.min(i, pages.length - 1)];
      i++;
      return page;
    },
  };
  return {
    cfg: { rpcUrl: "http://x", networkPassphrase: NETWORK, contracts: { token: TOKEN, verifier: TOKEN, auditor: TOKEN } },
    server,
  } as unknown as ChainClient;
}

describe("chain events parse", () => {
  it("parses a deposit + transfer, skips unknown, normalizes the cursor", async () => {
    // Single page whose cursor ledger is >= latestLedger, so paging stops.
    const cursor = transferEvent.id;
    const client = mockClient([
      { events: [depositEvent, transferEvent, unknownEvent], cursor, latestLedger: cursorLedger(cursor) },
    ]);

    const res = await fetchEvents(client, { startLedger: 100 });
    expect(res.events).toHaveLength(2);

    const dep = res.events[0]!;
    const tr = res.events[1]!;
    expect(dep.type).toBe("deposit");
    if (dep.type === "deposit") {
      expect(dep.from).toBe(A);
      expect(dep.to).toBe(B);
      expect(dep.amount).toBe(500_000n);
      // opIndex = toid & 0xfff of "…600", eventIndex = "0000000001" → 1
      expect(dep.cursor).toBe(
        naturalEventId({ ledger: 100, txHash: "aa".repeat(32), opIndex: Number(BigInt("429496729600") & 0xfffn), eventIndex: 1 }),
      );
    }

    expect(tr.type).toBe("transfer");
    if (tr.type === "transfer") {
      expect(tr.vTilde).toBe(11n);
      expect(tr.sigma).toBe(22n);
      expect(tr.bTilde).toBe(33n);
      expect(tr.vAudR).toBe(44n);
      expect(tr.rAudR).toBe(55n);
      expect(tr.vAudS).toBe(66n);
      expect(tr.bAudS).toBe(77n);
      expect(tr.rE.equals(rE)).toBe(true);
    }

    expect(res.cursor).toBe(cursor);
  });

  it("follows pagination until the cursor reaches the latest ledger", async () => {
    const midCursor = "0000000429496729600-0000000001"; // ledger 100
    const endCursor = "0000000862017095680-0000000000"; // ledger 200
    const client = mockClient([
      { events: [depositEvent], cursor: midCursor, latestLedger: 200 },
      { events: [transferEvent], cursor: endCursor, latestLedger: 200 },
    ]);

    const res = await fetchEvents(client, { startLedger: 100 });
    expect(res.events.map((e) => e.type)).toEqual(["deposit", "transfer"]);
    expect(res.cursor).toBe(endCursor);
    expect(cursorLedger(endCursor)).toBe(200);
  });
});
