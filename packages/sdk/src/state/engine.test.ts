import { describe, expect, it } from "vitest";

import { StateEngine, commitmentBytes } from "./engine.js";
import type { ConfidentialEvent, TransferEvent } from "./types.js";
import { deriveKeys, type KeyPair } from "../crypto/keys.js";
import { H, scalarMul, pointToBytes, commit } from "../crypto/grumpkin.js";
import { buildTransferWitness } from "../witness/transfer.js";

// Deterministic, distinct addr_f per fixture so key sets don't collide.
const ADDR_F = 0x1234n;
const SENDER = "GSENDER";
const ME = "GME";

function keysFor(sk: bigint): KeyPair {
  return deriveKeys(sk, ADDR_F);
}

// Auditor key set (arbitrary points on H for these offline tests).
const kAudR = scalarMul(7n, H);
const kAudS = scalarMul(11n, H);

function engineFor(keys: KeyPair): StateEngine {
  return new StateEngine({ address: ME, keys, kAudR, kAudS });
}

describe("StateEngine (offline)", () => {
  it("deposit then merge moves value into spendable", () => {
    const eng = engineFor(keysFor(0xa11cen));
    const events: ConfidentialEvent[] = [
      { type: "deposit", ledger: 1, from: SENDER, to: ME, amount: 100n },
      { type: "merge", ledger: 2, account: ME },
    ];
    eng.ingestEvents(events);

    expect(eng.spendable().v).toBe(100n);
    expect(eng.spendable().r).toBe(0n);
    expect(eng.receiving().v).toBe(0n);
  });

  it("credits an incoming transfer via decryptIncoming", () => {
    const myKeys = keysFor(0xbeefn);
    const senderKeys = keysFor(0xf00dn);

    // Sender builds a real transfer witness targeting MY public viewing key.
    // The engine must recover the amount (40) from the emitted ciphertext.
    const w = buildTransferWitness({
      keys: senderKeys,
      v: 1000n,
      r: 5n,
      amount: 40n,
      pvkB: myKeys.PVK,
      kAudR,
      kAudS,
    });

    const transferIn: TransferEvent = {
      type: "transfer",
      ledger: 3,
      from: SENDER,
      to: ME,
      rE: w.payload.rE,
      vTilde: w.payload.vTilde,
      sigma: w.payload.sigma,
      bTilde: w.payload.bTilde,
      vAudR: w.payload.vAudR,
      rAudR: w.payload.rAudR,
      vAudS: w.payload.vAudS,
      bAudS: w.payload.bAudS,
    };

    const eng = engineFor(myKeys);
    eng.ingestEvents([transferIn]);

    // decryptIncoming recovers the exact plaintext amount + blinding.
    expect(eng.receiving().v).toBe(40n);
    expect(eng.receiving().r).toBe(w.recipientView.rTx);
    // spendable is untouched by an incoming credit.
    expect(eng.spendable().v).toBe(0n);

    // The reconstructed receiving opening re-commits to the sender's C_tx.
    expect(commit(eng.receiving().v, eng.receiving().r).equals(w.payload.cTx)).toBe(true);
  });

  it("buildTransferWitness produces the 29-key witness consistent with spendable", () => {
    const myKeys = keysFor(0xc0ffeen);
    const eng = engineFor(myKeys);
    // Fund spendable = 100 via deposit + merge.
    eng.ingestEvents([
      { type: "deposit", ledger: 1, from: SENDER, to: ME, amount: 100n },
      { type: "merge", ledger: 2, account: ME },
    ]);

    const recipient = keysFor(0xd00dn);
    const w = eng.buildTransferWitness({
      toViewingPub: pointToBytes(recipient.PVK),
      amount: 30n,
    });

    // 29 Noir inputs (fields + 8 points × 2 coords).
    expect(Object.keys(w.inputs)).toHaveLength(29);

    // c_spend in the witness matches the engine's current spendable opening.
    const cSpend = commit(eng.spendable().v, eng.spendable().r);
    const { x: sx, y: sy } = cSpend.toAffine();
    expect(BigInt(w.inputs.c_spend_x!)).toBe(sx);
    expect(BigInt(w.inputs.c_spend_y!)).toBe(sy);

    // c_spend_new commits to (v - amount) = 70 with the derived spend-r.
    expect(w.next.v).toBe(70n);
    const cSpendNew = commit(w.next.v, w.next.r);
    const { x: nx, y: ny } = cSpendNew.toAffine();
    expect(BigInt(w.inputs.c_spend_new_x!)).toBe(nx);
    expect(BigInt(w.inputs.c_spend_new_y!)).toBe(ny);
  });

  it("verifyAgainstChain matches reconstructed openings and catches tampering", () => {
    const myKeys = keysFor(0x5eedn);
    const eng = engineFor(myKeys);
    eng.ingestEvents([
      { type: "deposit", ledger: 1, from: SENDER, to: ME, amount: 100n },
      { type: "merge", ledger: 2, account: ME },
    ]);

    const spendableC = commitmentBytes(eng.spendable());
    const receivingC = commitmentBytes(eng.receiving());

    const good = eng.verifyAgainstChain({ spendableC, receivingC });
    expect(good).toEqual({ ok: true, spendableOk: true, receivingOk: true });

    // Flip one byte of the on-chain spendable commitment.
    const tampered = new Uint8Array(spendableC);
    tampered[0]! ^= 0x01;
    const bad = eng.verifyAgainstChain({ spendableC: tampered, receivingC });
    expect(bad.spendableOk).toBe(false);
    expect(bad.receivingOk).toBe(true);
    expect(bad.ok).toBe(false);
  });
});
