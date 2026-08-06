/**
 * The adversaries, in CI.
 *
 * examples/sabotage.mjs demonstrates this against live testnet state, which is
 * the version a person watches. These tests are the version that must never
 * silently stop working: they pin WHICH defence catches WHICH attack, because
 * the layering is the actual claim.
 *
 * If a change ever made C3 appear to catch the lying archives, that would not
 * be an improvement. It would mean the test is no longer modelling an indexer
 * that lies, and the commitment check would be going unexercised.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { Address, xdr } from "@stellar/stellar-sdk";

import { MemoryStore } from "../src/store.js";
import { dishonestStore } from "../src/tamper.js";

const CONTRACT = "CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const ALICE = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

/** An event carrying a `b_tilde` field, so corruption has something to bite. */
function event(name, ledger, bTilde = 0x11223344) {
  return {
    contract_id: CONTRACT,
    event_name: name,
    ledger_seq: ledger,
    tx_hash: `tx-${ledger}`,
    operation_index: 0,
    event_index: 0,
    topics_xdr: [
      xdr.ScVal.scvSymbol(name).toXDR("base64"),
      new Address(ALICE).toScVal().toXDR("base64"),
    ],
    data_xdr: xdr.ScVal
      .scvMap([
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("b_tilde"),
          val: xdr.ScVal.scvBytes(Buffer.from(bTilde.toString(16).padStart(8, "0"), "hex")),
        }),
      ])
      .toXDR("base64"),
    participants: [ALICE],
  };
}

const query = (store) =>
  store.query({
    contractId: CONTRACT,
    account: ALICE,
    fromLedger: 1,
    toLedger: 1000,
    limit: 100,
  });

let honest;
beforeEach(() => {
  honest = new MemoryStore();
  honest.ingest([event("deposit", 10), event("merge", 20), event("transfer", 30)], 1, 1000, 1000);
});

describe("honest baseline", () => {
  it("serves everything and vouches for the range", () => {
    expect(query(honest).events).toHaveLength(3);
    expect(honest.isComplete(1, 1000)).toBe(true);
  });
});

describe("adversary · honest-gap", () => {
  it("serves the events but refuses to vouch, C3 is the defence", () => {
    const bad = dishonestStore(honest, { mode: "honest-gap" });
    expect(query(bad).events).toHaveLength(3);
    expect(bad.isComplete(1, 1000)).toBe(false);
  });
});

describe("adversary · omit", () => {
  it("drops the targeted event while claiming completeness", () => {
    const bad = dishonestStore(honest, { mode: "omit", eventName: "merge" });
    const names = query(bad).events.map((e) => e.event_name);
    expect(names).toEqual(["deposit", "transfer"]);
    // The lie: C3 cannot catch this, so it must not appear to.
    expect(bad.isComplete(1, 1000)).toBe(true);
  });

  it("leaves every other event untouched", () => {
    const bad = dishonestStore(honest, { mode: "omit", eventName: "merge" });
    const served = query(bad).events;
    const original = query(honest).events.filter((e) => e.event_name !== "merge");
    expect(served).toEqual(original);
  });
});

describe("adversary · corrupt", () => {
  it("alters the targeted field while claiming completeness", () => {
    const bad = dishonestStore(honest, { mode: "corrupt", eventName: "transfer" });
    const served = query(bad).events.find((e) => e.event_name === "transfer");
    const original = query(honest).events.find((e) => e.event_name === "transfer");
    expect(served.data_xdr).not.toBe(original.data_xdr);
    expect(bad.isComplete(1, 1000)).toBe(true);
  });

  it("produces a PERFECTLY DECODABLE event carrying a wrong value", () => {
    // This is what makes the attack worth defending against. A malformed event
    // is rejected by any parser for the wrong reason; this one parses cleanly
    // and is wrong by a single unit, so only the chain reveals it.
    const bad = dishonestStore(honest, { mode: "corrupt", eventName: "transfer" });
    const served = query(bad).events.find((e) => e.event_name === "transfer");

    const decoded = xdr.ScVal.fromXDR(served.data_xdr, "base64");
    expect(decoded.switch().name).toBe("scvMap");

    const entry = decoded.map().find((e) => e.key().sym().toString() === "b_tilde");
    const got = Buffer.from(entry.val().bytes()).toString("hex");
    // 0x11223344 nudged in the last byte.
    expect(got).toBe("11223345");
  });

  it("does not touch other event families", () => {
    const bad = dishonestStore(honest, { mode: "corrupt", eventName: "transfer" });
    const served = query(bad).events.find((e) => e.event_name === "deposit");
    const original = query(honest).events.find((e) => e.event_name === "deposit");
    expect(served.data_xdr).toBe(original.data_xdr);
  });
});

describe("the adversaries are otherwise faithful", () => {
  it("keeps health and checkpoint behaviour intact", () => {
    // A demo that passed because the hostile store was broken in some unrelated
    // way would prove nothing, so only the attacked behaviour may differ.
    for (const mode of ["honest-gap", "omit", "corrupt"]) {
      const bad = dishonestStore(honest, { mode });
      expect(bad.ingestedThrough()).toBe(honest.ingestedThrough());
      expect(bad.latestLedger).toBe(honest.latestLedger);
      expect(bad.checkpoint({ contractId: CONTRACT, account: ALICE, atLedger: 1000 })).toEqual(
        honest.checkpoint({ contractId: CONTRACT, account: ALICE, atLedger: 1000 }),
      );
    }
  });
});
