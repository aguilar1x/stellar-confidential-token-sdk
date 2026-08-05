/**
 * Auditor-decryption round-trip (no proving). Build transfer/withdraw witnesses
 * with a known auditor secret `k` (K_aud = k·H), then check the auditor-side
 * decryptors recover the amount, the sender's post-op balance, and r_tx from
 * nothing but the would-be event fields and `k`. This is the load-bearing
 * correctness gate for the Z6 auditor surface.
 */
import { describe, expect, it } from "vitest";

import { deriveKeys } from "../crypto/keys.js";
import { H, scalarMul, commit } from "../crypto/grumpkin.js";
import { buildTransferWitness } from "../witness/transfer.js";
import { buildWithdrawWitness } from "../witness/withdraw.js";
import type { TransferEvent, WithdrawEvent } from "../chain/events.js";
import {
  auditTransfer,
  auditTransferSenderChannel,
  auditTransferRecipientChannel,
  auditWithdraw,
  auditorPublicKey,
} from "./decrypt.js";

const addrF = 0x1234n;
const sender = deriveKeys(1111n, addrF);
const recipient = deriveKeys(2222n, addrF);
const k = 0x00c066da47bac8f87cd3eb9a36c37b417ca40cfa2730e7d8eb7f0bf939d11832n;
const kAud = auditorPublicKey(k);

const v = 1_000_000n;
const r = 777n;
const amount = 123_456n;

/**
 * Project a transfer witness payload into the on-chain TransferEvent shape the
 * auditor sees (only the fields the auditor channels read are load-bearing).
 */
function transferEventFrom(tw: ReturnType<typeof buildTransferWitness>): TransferEvent {
  return {
    type: "transfer",
    ledger: 100,
    txHash: "0xtx",
    cursor: "100-0xtx-0-0",
    from: "GSENDER",
    to: "GRECIP",
    rE: tw.payload.rE,
    vTilde: tw.payload.vTilde,
    sigma: tw.payload.sigma,
    bTilde: tw.payload.bTilde,
    vAudR: tw.payload.vAudR,
    rAudR: tw.payload.rAudR,
    vAudS: tw.payload.vAudS,
    bAudS: tw.payload.bAudS,
  };
}

function withdrawEventFrom(
  ww: ReturnType<typeof buildWithdrawWitness>,
  wAmount: bigint,
): WithdrawEvent {
  return {
    type: "withdraw",
    ledger: 101,
    txHash: "0xtx2",
    cursor: "101-0xtx2-0-0",
    from: "GSENDER",
    to: "GDEST",
    amount: wAmount,
    rE: ww.payload.rE,
    sigma: ww.payload.sigma,
    bTilde: ww.payload.bTilde,
    bAudS: ww.payload.bAudS,
  };
}

describe("auditor decrypt", () => {
  it("auditorPublicKey == k·H", () => {
    expect(kAud.equals(scalarMul(k, H))).toBe(true);
  });

  it("transfer: recovers amount, sender post-balance, and r_tx (both channels agree)", () => {
    const tw = buildTransferWitness({
      keys: sender,
      v,
      r,
      amount,
      pvkB: recipient.PVK,
      kAudR: kAud,
      kAudS: kAud,
    });
    const ev = transferEventFrom(tw);

    const audited = auditTransfer(k, ev);
    expect(audited.amount).toBe(amount);
    expect(audited.senderBalance).toBe(v - amount);
    expect(audited.channelsAgree).toBe(true);
    // r_tx must open the emitted C_tx: commit(v_tx, r_tx) == C_tx.
    expect(commit(audited.amount, audited.rTx).equals(tw.payload.cTx)).toBe(true);

    // Standalone channel helpers agree with the combined result.
    const sCh = auditTransferSenderChannel(k, ev);
    const rCh = auditTransferRecipientChannel(k, ev);
    expect(sCh.amount).toBe(amount);
    expect(sCh.senderBalance).toBe(v - amount);
    expect(rCh.amount).toBe(amount);
    expect(rCh.rTx).toBe(audited.rTx);
  });

  it("transfer: wrong key decrypts to garbage and channels disagree", () => {
    const tw = buildTransferWitness({
      keys: sender,
      v,
      r,
      amount,
      pvkB: recipient.PVK,
      kAudR: kAud,
      kAudS: kAud,
    });
    const ev = transferEventFrom(tw);
    const wrong = auditTransfer(k + 1n, ev);
    expect(wrong.channelsAgree).toBe(false);
    expect(wrong.amount).not.toBe(amount);
  });

  it("withdraw: recovers the sender post-balance checkpoint", () => {
    const wAmount = 400n;
    const ww = buildWithdrawWitness({ keys: sender, v, r, amount: wAmount, kAudS: kAud });
    const ev = withdrawEventFrom(ww, wAmount);
    const wAudited = auditWithdraw(k, ev);
    expect(wAudited.senderBalance).toBe(v - wAmount);
  });
});
