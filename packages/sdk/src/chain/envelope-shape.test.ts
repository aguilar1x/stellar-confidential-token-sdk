/**
 * Regression pin for the `data: Bytes` envelope shape.
 *
 * The encoders return `scvBytes(<map XDR>)`. Whoever builds the invocation must
 * pass the bytes INSIDE that ScVal, because the invocation layer applies its own
 * `scvBytes` wrap. Passing `.toXDR()` instead double-wraps, and the contract
 * rejects it with `InvalidData` (#3507) — a failure that surfaces only against a
 * live node, long after the proof was generated, and reads like a proving bug.
 *
 * These tests decode the envelope back and assert it is the payload/proof map,
 * so a regression fails here in milliseconds instead of on testnet.
 */

import { describe, expect, it } from "vitest";
import { xdr } from "@stellar/stellar-sdk";

import { encodeRegisterData, encodeTransferData, encodeWithdrawData } from "./payload.js";
import { deriveKeys } from "../crypto/keys.js";
import { buildRegisterWitness } from "../witness/register.js";
import { buildTransferWitness } from "../witness/transfer.js";
import { buildWithdrawWitness } from "../witness/withdraw.js";
import { H, scalarMul } from "../crypto/grumpkin.js";

const ADDR_F = 0x2222n;
/** Any field element: no gate reads acct_f, its presence is the binding. */
const ACCT_F = 0x00ac_c700_0000_0001n;
const keys = deriveKeys(0x1234_5678_9abc_deffn, ADDR_F, ACCT_F);
const other = deriveKeys(0x0fed_cba9_8765_4321n, ADDR_F);
const kAud = scalarMul(0xabcdefn, H);
const PROOF = new Uint8Array(64).fill(0xab);

/** The bytes a caller must hand to the contract, and the map they decode to. */
function decodeEnvelope(scVal: xdr.ScVal): xdr.ScVal {
  // Step 1: the encoder's result is already a Bytes ScVal.
  expect(scVal.switch().name).toBe("scvBytes");
  // Step 2: those bytes are the XDR of the {payload, proof} map — NOT the XDR
  // of another scvBytes wrapper.
  return xdr.ScVal.fromXDR(Buffer.from(scVal.bytes()));
}

function expectWellFormed(scVal: xdr.ScVal) {
  const inner = decodeEnvelope(scVal);
  expect(inner.switch().name).toBe("scvMap");

  const keysInMap = inner
    .map()!
    .map((e) => e.key().sym().toString())
    .sort();
  expect(keysInMap).toEqual(["payload", "proof"]);

  const proofEntry = inner.map()!.find((e) => e.key().sym().toString() === "proof")!;
  expect(new Uint8Array(proofEntry.val().bytes())).toEqual(PROOF);
}

describe("data envelope shape", () => {
  it("register decodes to the {payload, proof} map", () => {
    expectWellFormed(encodeRegisterData(buildRegisterWitness(keys), PROOF));
  });

  it("transfer decodes to the {payload, proof} map", () => {
    const w = buildTransferWitness({
      keys,
      v: 1000n,
      r: 7n,
      amount: 400n,
      pvkB: other.PVK,
      kAudR: kAud,
      kAudS: kAud,
    });
    expectWellFormed(encodeTransferData(w, PROOF));
  });

  it("withdraw decodes to the {payload, proof} map", () => {
    const w = buildWithdrawWitness({ keys, v: 1000n, r: 7n, amount: 250n, kAudS: kAud });
    expectWellFormed(encodeWithdrawData(w, PROOF));
  });

  it("catches the double-wrap that the contract rejects with InvalidData", () => {
    const scVal = encodeRegisterData(buildRegisterWitness(keys), PROOF);

    // What a correct caller sends.
    const correct = new Uint8Array(scVal.bytes());
    // What `.toXDR()` would send instead — the serialized Bytes WRAPPER.
    const doubleWrapped = new Uint8Array(scVal.toXDR());

    expect(doubleWrapped).not.toEqual(correct);
    // The wrapper is strictly larger, and decoding it yields bytes again
    // rather than the map the contract expects.
    expect(doubleWrapped.length).toBeGreaterThan(correct.length);
    expect(xdr.ScVal.fromXDR(Buffer.from(doubleWrapped)).switch().name).toBe("scvBytes");
    expect(xdr.ScVal.fromXDR(Buffer.from(correct)).switch().name).toBe("scvMap");
  });
});
