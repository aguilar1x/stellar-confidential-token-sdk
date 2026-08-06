/**
 * Offline confidential-state reconstruction. Browser-safe barrel: exports the
 * engine, in-memory store, and types. The Node-only `json-store.ts` is NOT
 * re-exported here, import it directly by subpath (Z2.14 wires the node entry).
 */

export { StateEngine, commitmentBytes } from "./engine.js";
export { MemoryStore, bigintReplacer, reviveState, cloneState, type StateStore } from "./store.js";
export {
  freshState,
  type AccountState,
  type ConfidentialEvent,
  type RegisterEvent,
  type DepositEvent,
  type MergeEvent,
  type WithdrawEvent,
  type TransferEvent,
  type StateEngineConfig,
} from "./types.js";
