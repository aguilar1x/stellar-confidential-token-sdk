/**
 * Pluggable persistence for reconstructed account state (offline). Ported from
 * the demo's `state/store.ts`. Local persistence is load-bearing for
 * correctness, not just performance: once an event ages out of the chain's
 * event-retention window, the cached openings are the ONLY way to keep the
 * balance spendable.
 *
 * This module is environment-neutral (no Node built-ins) so it is safe to
 * bundle for the browser. {@link MemoryStore} works everywhere; the Node-only
 * {@link ./json-store.js#JsonFileStore} lives in json-store.ts (kept out of the
 * browser barrel).
 */

import type { AccountState } from "./types.js";

export interface StateStore {
  load(address: string): Promise<AccountState | null>;
  save(address: string, state: AccountState): Promise<void>;
}

/** JSON replacer: serialize bigints as `0x…` strings. */
export function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? `0x${value.toString(16)}` : value;
}

/** Rebuild an {@link AccountState} from its JSON form (bigints as `0x…`). */
export function reviveState(raw: Record<string, unknown>): AccountState {
  const op = (o: { v: string; r: string }): { v: bigint; r: bigint } => ({
    v: BigInt(o.v),
    r: BigInt(o.r),
  });
  return {
    spendable: op(raw.spendable as { v: string; r: string }),
    receiving: op(raw.receiving as { v: string; r: string }),
    lastLedger: raw.lastLedger as number,
  };
}

export function cloneState(s: AccountState): AccountState {
  return {
    spendable: { ...s.spendable },
    receiving: { ...s.receiving },
    lastLedger: s.lastLedger,
  };
}

/** Ephemeral in-memory store (tests, single-run scripts). */
export class MemoryStore implements StateStore {
  #byAddress = new Map<string, AccountState>();

  async load(address: string): Promise<AccountState | null> {
    const s = this.#byAddress.get(address);
    return s ? cloneState(s) : null;
  }
  async save(address: string, state: AccountState): Promise<void> {
    this.#byAddress.set(address, cloneState(state));
  }
}
