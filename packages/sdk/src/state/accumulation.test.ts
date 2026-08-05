/**
 * Blinding accumulation across multiple received payments.
 *
 * A commitment is `v·G + r·H`, and the chain folds an incoming payment in by
 * adding POINTS. So the openings combine as Grumpkin scalars, modulo the group
 * order `p` — not modulo `r`. Individual blindings are `F_r` elements and need
 * no reduction; their sums do not stay in `F_r`, and since `r < p`, reducing a
 * sum modulo `r` subtracts `r` where the group subtracts nothing. The opening
 * is then wrong by exactly `r·H`.
 *
 * This is invisible with one payment and near-certain with several: two random
 * blindings cross `r` about half the time. Found against a real testnet
 * account that had received eight — six of the seven additions wrapped.
 *
 * The consequence is not cosmetic. A wallet in that state computes an opening
 * its own on-chain commitment does not verify against, so it reports its state
 * as corrupt; and after a merge it would build a spend witness around a
 * blinding the chain never accumulated.
 */

import { describe, expect, it } from "vitest";

import { StateEngine } from "./engine.js";
import { deriveKeys } from "../crypto/keys.js";
import { commit, pointToBytes, H, scalarMul, IDENTITY, type Point } from "../crypto/grumpkin.js";
import { FR_MODULUS, FP_MODULUS } from "../crypto/constants.js";
import { groupAdd, frAdd } from "../crypto/field.js";
import { deriveTxBlind, encryptAmount, deriveEphemeralRE } from "../crypto/poseidon2.js";
import { ecdh } from "../crypto/grumpkin.js";

const ADDR_F = 0x2222n;
const recipient = deriveKeys(0x1234_5678_9abc_deffn, ADDR_F);
const ME = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
const SENDER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

/**
 * Build the transfer event a sender would emit for `amount`, exactly as the
 * witness builder does, so the recipient's decryption path is the real one.
 */
function incoming(amount: bigint, sigma: bigint, ledger: number) {
  const rE = deriveEphemeralRE(recipient.vk, sigma);
  const R = scalarMul(rE, H);
  const s = ecdh(rE, recipient.PVK);
  return {
    event: {
      type: "transfer" as const,
      from: SENDER,
      to: ME,
      ledger,
      rE: R,
      vTilde: encryptAmount(amount, s, sigma),
      sigma,
      bTilde: 0n,
      vAudR: 0n,
      rAudR: 0n,
      vAudS: 0n,
      bAudS: 0n,
    },
    /** What the chain accumulates for this payment. */
    cTx: commit(amount, deriveTxBlind(s, sigma)),
  };
}

/** What the chain would hold after these payments: the sum of their points. */
function chainCommitment(parts: Point[]): Uint8Array {
  return pointToBytes(parts.reduce((acc, p) => acc.add(p), IDENTITY));
}

describe("the moduli are genuinely different", () => {
  it("r < p, so a sum can be a valid scalar and an invalid field element", () => {
    expect(FR_MODULUS).toBeLessThan(FP_MODULUS);
  });

  it("groupAdd and frAdd disagree exactly when the sum crosses r", () => {
    const a = FR_MODULUS - 10n;
    const b = 100n;
    expect(frAdd(a, b)).toBe(90n);
    expect(groupAdd(a, b)).toBe(FR_MODULUS + 90n);
    expect(groupAdd(a, b) - frAdd(a, b)).toBe(FR_MODULUS);
  });

  it("and agree when it does not", () => {
    expect(groupAdd(5n, 7n)).toBe(frAdd(5n, 7n));
  });

  it("the disagreement moves the commitment by r·H — not by nothing", () => {
    const wrong = commit(100n, frAdd(FR_MODULUS - 10n, 100n));
    const right = commit(100n, groupAdd(FR_MODULUS - 10n, 100n));
    expect(pointToBytes(wrong)).not.toEqual(pointToBytes(right));
    expect(pointToBytes(right)).toEqual(pointToBytes(wrong.add(scalarMul(FR_MODULUS, H))));
  });
});

describe("receiving balance accumulation", () => {
  it("one payment reconstructs exactly — which is why this hid for so long", () => {
    const p = incoming(12n, 1n, 10);
    const engine = new StateEngine({ address: ME, keys: recipient });
    engine.ingestEvents([p.event]);

    const r = engine.receiving();
    expect(r.v).toBe(12n);
    expect(pointToBytes(commit(r.v, r.r))).toEqual(chainCommitment([p.cTx]));
  });

  it("EIGHT payments reconstruct to the commitment the chain accumulated", () => {
    // The shape that exposed it: differing amounts, differing salts, enough of
    // them that the partial sums cross r repeatedly.
    const dues = [12n, 18n, 25n, 25n, 34n, 34n, 51n, 63n];
    const payments = dues.map((d, i) => incoming(d, BigInt(i + 1), 10 + i));

    const engine = new StateEngine({ address: ME, keys: recipient });
    engine.ingestEvents(payments.map((p) => p.event));

    const r = engine.receiving();
    expect(r.v).toBe(262n);
    expect(pointToBytes(commit(r.v, r.r))).toEqual(
      chainCommitment(payments.map((p) => p.cTx)),
    );
  });

  it("at least one partial sum actually wrapped — otherwise this proves nothing", () => {
    // Guards the test above: if no sum crossed r, both moduli would agree and
    // the case would pass under the old, wrong implementation too.
    const dues = [12n, 18n, 25n, 25n, 34n, 34n, 51n, 63n];
    let raw = 0n;
    let wraps = 0;
    dues.forEach((d, i) => {
      const sigma = BigInt(i + 1);
      const s = ecdh(deriveEphemeralRE(recipient.vk, sigma), recipient.PVK);
      const before = raw;
      raw += deriveTxBlind(s, sigma);
      if (before + deriveTxBlind(s, sigma) >= FR_MODULUS) wraps++;
      raw %= FP_MODULUS;
    });
    expect(wraps).toBeGreaterThan(0);
  });

  it("merge folds receiving into spendable in the same field", () => {
    const payments = [incoming(40n, 1n, 10), incoming(60n, 2n, 11)];
    const engine = new StateEngine({ address: ME, keys: recipient });
    engine.ingestEvents([
      ...payments.map((p) => p.event),
      { type: "merge" as const, account: ME, ledger: 20 },
    ]);

    const s = engine.spendable();
    expect(s.v).toBe(100n);
    expect(engine.receiving().v).toBe(0n);
    // Merge adds the two commitment points on-chain, so the merged spendable
    // must open to the same sum.
    expect(pointToBytes(commit(s.v, s.r))).toEqual(chainCommitment(payments.map((p) => p.cTx)));
  });
});
