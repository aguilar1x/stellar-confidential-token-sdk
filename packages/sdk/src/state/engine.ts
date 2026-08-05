/**
 * Offline state reconstruction from the contract event stream.
 *
 * Replays confidential-token events to recover the local openings (`v`, `r`) of
 * an account's spendable and receiving balances — the secrets needed to build
 * the next proof. Unlike the demo's networked engine, this is OFFLINE: it never
 * fetches events. Z5 (web) fetches them and feeds them into
 * {@link StateEngine.ingestEvents}.
 *
 * Reconstruction rules (owner = `cfg.address`):
 *   - register(me)        → (no balance change; registration is not tracked here).
 *   - deposit(_, me)      → receiving += (amount, 0)   [deposits carry r = 0].
 *   - transfer(other, me) → ECDH-decrypt (v_tx, r_tx); receiving += (v_tx, r_tx).
 *   - merge(me)           → spendable += receiving; receiving = (0, 0).
 *   - withdraw(me, _)     → spendable = open(b_tilde, sigma)  [event encodes v_new].
 *   - transfer(me, _)     → spendable = open(b_tilde, sigma).
 *
 * The spendable rule needs no history: withdraw/transfer emit
 * `b_tilde = v_new + Poseidon2(ENC_BAL, vk, sigma)`, so the owner reads the
 * resulting spendable value straight from the event. The receiving balance is a
 * running sum, so every crediting event must be replayed.
 *
 * Ported from `stellar-confidential-token-demo/packages/sdk/src/state/engine.ts`.
 */

import { commit, ecdh, pointFromBytes, pointToBytes, type Point } from "../crypto/grumpkin.js";
import { frMod, groupAdd } from "../crypto/field.js";
import { DOMAIN } from "../crypto/constants.js";
import { deriveSpendR, deriveTxBlind, poseidonWithDomain } from "../crypto/poseidon2.js";
import { buildTransferWitness, type TransferParams } from "../witness/transfer.js";
import type { Opening } from "../types.js";
import type { StateStore } from "./store.js";
import { cloneState } from "./store.js";
import { freshState, type AccountState, type ConfidentialEvent, type StateEngineConfig } from "./types.js";

export class StateEngine {
  #state: AccountState;

  constructor(private cfg: StateEngineConfig) {
    this.#state = freshState();
  }

  /**
   * Load persisted state from the configured store, replacing the current
   * in-memory state. No-op (fresh zero-state kept) when there is no store or no
   * saved entry. Optional — the offline engine is fully usable without it.
   */
  async load(): Promise<AccountState> {
    if (this.cfg.store) {
      const prior = await this.cfg.store.load(this.cfg.address);
      if (prior) this.#state = prior;
    }
    return cloneState(this.#state);
  }

  /** Recover an incoming transfer's amount and blinding from its event. */
  decryptIncoming(rE: Point, vTilde: bigint, sigma: bigint): { vTx: bigint; rTx: bigint } {
    const s = ecdh(this.cfg.keys.vk, rE);
    const vTx = frMod(vTilde - poseidonWithDomain(DOMAIN.TX_AMOUNT, [s, sigma]));
    const rTx = deriveTxBlind(s, sigma);
    return { vTx, rTx };
  }

  /** Recover the owner's post-op spendable opening from an emitted b_tilde. */
  openSpendable(bTilde: bigint, sigma: bigint): Opening {
    const v = frMod(bTilde - poseidonWithDomain(DOMAIN.ENCRYPTED_BALANCE, [this.cfg.keys.vk, sigma]));
    const r = deriveSpendR(this.cfg.keys.vk, sigma);
    return { v, r };
  }

  /** Apply one event in-place to `state`. */
  #apply(state: AccountState, ev: ConfidentialEvent): void {
    const me = this.cfg.address;
    switch (ev.type) {
      case "register":
        break;
      case "deposit":
        if (ev.to === me) state.receiving.v += ev.amount;
        break;
      case "merge":
        if (ev.account === me) {
          // Merge adds the two commitment POINTS on-chain, so the openings
          // combine as Grumpkin scalars — modulo p, not r. See groupAdd.
          state.spendable = {
            v: state.spendable.v + state.receiving.v,
            r: groupAdd(state.spendable.r, state.receiving.r),
          };
          state.receiving = { v: 0n, r: 0n };
        }
        break;
      case "withdraw":
        if (ev.from === me) state.spendable = this.openSpendable(ev.bTilde, ev.sigma);
        break;
      case "transfer":
        // Order matters for a self-transfer: the sender's spendable is set from
        // the event, and the recipient credit is added to receiving.
        if (ev.from === me) state.spendable = this.openSpendable(ev.bTilde, ev.sigma);
        if (ev.to === me) {
          const { vTx, rTx } = this.decryptIncoming(ev.rE, ev.vTilde, ev.sigma);
          // Same here: the chain folds C_tx into the receiving commitment by
          // point addition, so the blinding accumulates modulo p.
          state.receiving = {
            v: state.receiving.v + vTx,
            r: groupAdd(state.receiving.r, rTx),
          };
        }
        break;
    }
    state.lastLedger = Math.max(state.lastLedger, ev.ledger);
  }

  /**
   * Pure replay: apply every event to the current state in order, persisting
   * afterwards when a store is configured. Returns a snapshot of the resulting
   * state. This is the offline lift of the demo's networked `sync()`.
   */
  ingestEvents(events: ConfidentialEvent[]): AccountState {
    for (const ev of events) this.#apply(this.#state, ev);
    if (this.cfg.store) void this.cfg.store.save(this.cfg.address, cloneState(this.#state));
    return cloneState(this.#state);
  }

  /** Current spendable opening. */
  spendable(): Opening {
    return { ...this.#state.spendable };
  }

  /** Current receiving opening. */
  receiving(): Opening {
    return { ...this.#state.receiving };
  }

  /** Current reconstructed state snapshot. */
  state(): AccountState {
    return cloneState(this.#state);
  }

  /**
   * Assemble the 29-field transfer witness from the engine's keys + current
   * spendable opening + fresh randomness, by delegating to the already-ported
   * pure builder in `witness/transfer.ts`.
   *
   * `toViewingPub` is the recipient's public viewing key `PVK_B` (their 64-byte
   * on-chain point encoding). Auditor keys come from the engine config; they
   * may be overridden per call.
   */
  buildTransferWitness(p: {
    toViewingPub: Uint8Array;
    amount: bigint;
    kAudR?: Point;
    kAudS?: Point;
    sigma?: bigint;
    rE?: bigint;
  }): ReturnType<typeof buildTransferWitness> {
    const kAudR = p.kAudR ?? this.cfg.kAudR;
    const kAudS = p.kAudS ?? this.cfg.kAudS;
    if (!kAudR || !kAudS) {
      throw new Error("buildTransferWitness requires auditor keys (config.kAudR/kAudS or per-call)");
    }
    const spendable = this.#state.spendable;
    const params: TransferParams = {
      keys: this.cfg.keys,
      v: spendable.v,
      r: spendable.r,
      amount: p.amount,
      pvkB: pointFromBytes(p.toViewingPub),
      kAudR,
      kAudS,
      sigma: p.sigma,
      rE: p.rE,
    };
    return buildTransferWitness(params);
  }

  /**
   * Strong correctness check: the reconstructed openings must re-commit to the
   * exact points stored on-chain. A mismatch means the local state diverged (a
   * missed event, an expired credit, or a bug) and is unsafe to spend from.
   *
   * `onchain` carries the 64-byte on-chain commitment encodings.
   */
  verifyAgainstChain(onchain: { spendableC: Uint8Array; receivingC: Uint8Array }): {
    ok: boolean;
    spendableOk: boolean;
    receivingOk: boolean;
  } {
    // Compare the on-chain 64-byte commitment encodings directly. Byte-wise
    // (rather than decode-then-Point.equals) so arbitrary tampering — including
    // bytes that would decode off-curve — is reported as a mismatch instead of
    // throwing.
    const spendableOk = bytesEqual(commitmentBytes(this.#state.spendable), onchain.spendableC);
    const receivingOk = bytesEqual(commitmentBytes(this.#state.receiving), onchain.receivingC);
    return { ok: spendableOk && receivingOk, spendableOk, receivingOk };
  }
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Encode a Pedersen commitment opening to its 64-byte on-chain point. */
export function commitmentBytes(o: Opening): Uint8Array {
  return pointToBytes(commit(o.v, o.r));
}
