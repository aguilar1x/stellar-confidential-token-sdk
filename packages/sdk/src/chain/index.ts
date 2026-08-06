/**
 * Full chain-layer barrel, the `stellar-confidential-token-sdk/chain` subpath surface (see
 * `src/chain.ts`).
 *
 * ⚠️ Name collision: this module's `events.ts` defines a chain-layer
 * `ConfidentialEvent` union (Register/Deposit/Merge/Withdraw/Transfer, RPC/
 * indexer decoded) that is DISTINCT from the state-engine's `ConfidentialEvent`
 * (`state/types.ts`). Both cannot be `export *`-ed from the top-level
 * `stellar-confidential-token-sdk` barrel without clashing. Resolution: the top-level barrel keeps
 * the state-engine surface and re-exports ONLY `payload.js` from here; the chain
 * reader / events / auditor decrypt live on `stellar-confidential-token-sdk/chain` instead.
 */
export * from "./client.js";
export * from "./payload.js";
export * from "./events.js";
export * from "./indexer.js";
export * from "./indexer-v1.js";
export * from "./event-source.js";
