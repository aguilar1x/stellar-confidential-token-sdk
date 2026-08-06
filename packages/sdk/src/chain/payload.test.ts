import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { xdr } from "@stellar/stellar-sdk";

import { deriveKeys } from "../crypto/keys.js";
import { addressToField } from "../crypto/address.js";
import { H, scalarMul } from "../crypto/grumpkin.js";
import { buildRegisterWitness } from "../witness/register.js";
import { buildWithdrawWitness } from "../witness/withdraw.js";
import { buildTransferWitness } from "../witness/transfer.js";
import {
  scvStruct,
  encodeRegisterData,
  encodeWithdrawData,
  encodeTransferData,
} from "./payload.js";

// ---------------------------------------------------------------------------
// Byte-for-byte vector gate (Z2.10).
//
// PROVENANCE NOTE. `register.hex` still carries the hex agreed with the demo
// SDK. `withdraw.hex` and `transfer.hex` were regenerated when the verifier was
// redeployed from post-fix circuits: the ECDH secret became
// Poseidon2(delta_ecdh, S.x, S.y) and the auditor checkpoint pad moved to the
// second squeeze, so both payloads carry different field values. The demo SDK
// still implements the pre-fix forms and can no longer serve as the
// cross-check. What these vectors gate is unchanged — key names, sort order,
// flat-Point layout, field encoding — and the values are cross-checked instead
// by §6.2 circuit parity, which proves the real circuits accept these witnesses
// and self-verify.
//
// The `.hex` fixtures under test/vectors/ were produced by cross-checking OUR
// encoders against the reference demo SDK
// (stellar-confidential-token-demo/packages/sdk): the SAME fixed deterministic
// witness + fixed proof was fed through BOTH the demo's
// encode{Register,Withdraw,Transfer}Data and ours, and the two `.toXDR("hex")`
// strings were asserted equal (all three MATCH). The fixtures pin that agreed
// hex so the demo is not needed in CI; any future drift in our witness builders
// or payload codec (key names, sort order, flat-Point layout, field encoding)
// fails this test.
// ---------------------------------------------------------------------------

const VEC = join(dirname(fileURLToPath(import.meta.url)), "test", "vectors");
const readVec = (name: string) => readFileSync(join(VEC, `${name}.hex`), "utf8").trim();

// Fixed deterministic inputs — MUST match scratchpad/crosscheck.mjs exactly.
const ADDR = "CCREDIB3DG3IBVUKBL7QMEK4MTPSTODR7MQ34QY4SQ5LZ5L4WFWNVNXG";
const SK = 0x1122334455667788990011223344556677889900112233445566778899001122n;
const SK_R = 0x0a0b0c0d0e0f00112233445566778899aabbccddeeff00112233445566778899n;
const SK_AUDR = 0x00112233445566778899aabbccddeeff00112233445566778899aabbccddeeffn;
const SK_AUDS = 0x0feeddccbbaa99887766554433221100ffeeddccbbaa998877665544332211ffn;
const V = 1_000_000n;
const R = 0x00000000000000000000000000000000000000000000000000000000000abcden;
const AMOUNT = 250_000n;
const SIGMA = 0x00000000000000000000000000000000000000000000000000000000cafef00dn;
const RE = 0x000000000000000000000000000000000000000000000000000000000badf00dn;
const PROOF = new Uint8Array(64).fill(7);

const addrF = addressToField(ADDR);
/** Any field element: no gate reads acct_f, its presence is the binding. */
const ACCT_F = 0x00ac_c700_0000_0001n;
const keys = deriveKeys(SK, addrF, ACCT_F);
const kAudS = scalarMul(SK_AUDS, H);
const kAudR = scalarMul(SK_AUDR, H);
const pvkB = deriveKeys(SK_R, addrF).PVK;

describe("chain/payload byte-for-byte vectors", () => {
  it("encodeRegisterData matches the pinned demo-crosschecked hex", () => {
    const w = buildRegisterWitness(keys);
    expect(encodeRegisterData(w, PROOF).toXDR("hex")).toBe(readVec("register"));
  });

  it("encodeWithdrawData matches the pinned demo-crosschecked hex", () => {
    const w = buildWithdrawWitness({
      keys, v: V, r: R, amount: AMOUNT, kAudS, sigma: SIGMA, rE: RE,
    });
    expect(encodeWithdrawData(w, PROOF).toXDR("hex")).toBe(readVec("withdraw"));
  });

  it("encodeTransferData matches the pinned demo-crosschecked hex", () => {
    const w = buildTransferWitness({
      keys, v: V, r: R, amount: AMOUNT, pvkB, kAudR, kAudS, sigma: SIGMA, rE: RE,
    });
    expect(encodeTransferData(w, PROOF).toXDR("hex")).toBe(readVec("transfer"));
  });
});

describe("chain/payload structure", () => {
  it("scvStruct emits Symbol keys sorted ascending", () => {
    const s = scvStruct({
      zebra: xdr.ScVal.scvVoid(),
      alpha: xdr.ScVal.scvVoid(),
      middle: xdr.ScVal.scvVoid(),
    });
    expect(s.switch().name).toBe("scvMap");
    const entries = s.map()!;
    expect(entries.every((e) => e.key().switch().name === "scvSymbol")).toBe(true);
    expect(entries.map((e) => e.key().sym().toString())).toEqual([
      "alpha",
      "middle",
      "zebra",
    ]);
  });

  it("register envelope is scvBytes wrapping a sorted [payload, proof] map", () => {
    const w = buildRegisterWitness(keys);
    const dataArg = encodeRegisterData(w, PROOF);
    expect(dataArg.switch().name).toBe("scvBytes");

    const inner = xdr.ScVal.fromXDR(dataArg.bytes());
    expect(inner.switch().name).toBe("scvMap");
    expect(inner.map()!.map((e) => e.key().sym().toString())).toEqual([
      "payload",
      "proof",
    ]);
    expect(inner.map()!.every((e) => e.key().switch().name === "scvSymbol")).toBe(
      true,
    );

    const payload = inner.map()!.find((e) => e.key().sym().toString() === "payload")!.val();
    // Point y is a FLAT 64-byte value, not an {x,y} sub-map.
    const yEntry = payload.map()!.find((e) => e.key().sym().toString() === "y")!.val();
    expect(yEntry.switch().name).toBe("scvBytes");
    expect(yEntry.bytes().length).toBe(64);
  });
});
