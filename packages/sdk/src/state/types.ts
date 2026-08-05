/**
 * Local confidential-state types (offline). Ported from the demo's
 * `state/types.ts` + `chain/events.ts`, lifted to be OFFLINE: there is no
 * network sync here. The protocol keeps only Pedersen commitments on-chain; the
 * *openings* (`v`, `r`) live only in events and must be reconstructed locally by
 * replaying the event stream (see {@link ../state/engine.js}).
 *
 * Z5 (web) fetches events and feeds them into `StateEngine.ingestEvents(...)`.
 */

import type { Point } from "../crypto/grumpkin.js";
import type { KeyPair } from "../crypto/keys.js";
import type { Opening } from "../types.js";
import type { StateStore } from "./store.js";

export type { Opening };

/** Reconstructed local state for one confidential account (offline). */
export interface AccountState {
  /** Spendable balance opening (`C_spend`). */
  spendable: Opening;
  /** Receiving balance opening (`C_receive`). */
  receiving: Opening;
  /** Highest ledger reflected in this state. */
  lastLedger: number;
}

export function freshState(): AccountState {
  return {
    spendable: { v: 0n, r: 0n },
    receiving: { v: 0n, r: 0n },
    lastLedger: 0,
  };
}

/**
 * The confidential-token event union — the same field names/shapes as the
 * demo's `chain/events.ts`, minus the source-plumbing (`txHash`, `cursor`)
 * that only the networked fetcher needs. Every event carries the `ledger` it
 * landed at (drives `lastLedger`) and the owner-relative direction fields
 * (`from` / `to` / `account`) the replay uses.
 */
export interface RegisterEvent {
  type: "register";
  ledger: number;
  account: string;
  auditorId: number;
}
export interface DepositEvent {
  type: "deposit";
  ledger: number;
  from: string;
  to: string;
  amount: bigint;
}
export interface MergeEvent {
  type: "merge";
  ledger: number;
  account: string;
}
export interface WithdrawEvent {
  type: "withdraw";
  ledger: number;
  from: string;
  to: string;
  amount: bigint;
  rE: Point;
  sigma: bigint;
  bTilde: bigint;
  bAudS: bigint;
}
export interface TransferEvent {
  type: "transfer";
  ledger: number;
  from: string;
  to: string;
  rE: Point;
  vTilde: bigint;
  sigma: bigint;
  bTilde: bigint;
  vAudR: bigint;
  rAudR: bigint;
  vAudS: bigint;
  bAudS: bigint;
}

export type ConfidentialEvent =
  | RegisterEvent
  | DepositEvent
  | MergeEvent
  | WithdrawEvent
  | TransferEvent;

export interface StateEngineConfig {
  /**
   * Owner's confidential key set (for ECDH decryption, balance opening, and
   * building the next transfer witness). `vk` opens the owner's balances;
   * the full pair (`sk`, `Y`, `PVK`, `addr_f`) feeds `buildTransferWitness`.
   */
  keys: KeyPair;
  /** Owner's Stellar (G-) address (for event direction). */
  address: string;
  /**
   * Optional persistence. When omitted the engine keeps state in memory only,
   * seeded from a fresh zero-state on each construction.
   */
  store?: StateStore;
  /**
   * Auditor keys for the transfer witness's dual channels. Fixed per
   * deployment (from the auditor registry). Required only to call
   * {@link ../state/engine.js#StateEngine.buildTransferWitness}.
   */
  kAudR?: Point;
  kAudS?: Point;
}
