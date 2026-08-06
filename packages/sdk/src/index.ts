/**
 * Browser-safe public barrel for `stellar-confidential-token-sdk`. This entry MUST NOT import any
 * `node:*` module (directly or transitively). It is the surface a browser
 * bundle (Z5) consumes. Every node:fs-touching module (circuit/VK loaders, the
 * prove ops that read vendored circuits, the JSON file store) lives on the
 * `stellar-confidential-token-sdk/node` subpath ({@link ./node.ts}) instead.
 */
export type { ProofEnvelope, Opening } from "./types.js";
export * from "./crypto/index.js";
export * from "./account/index.js";
export * from "./witness/index.js";
// Only the XDR payload encoders are safe to re-export at the top level. The
// chain reader / events / auditor decrypt live on the `stellar-confidential-token-sdk/chain`
// subpath ({@link ./chain.ts}) because the chain-layer `ConfidentialEvent`
// union collides by name with the state-engine's (`state/types.ts`), which is
// re-exported below from `./state/index.js`. Keeping the chain reader off the
// top-level barrel leaves the existing StateEngine surface UNCHANGED.
export * from "./chain/payload.js";
// `proving/index.ts` re-exports ONLY `prover.js` (CircuitProver, KECCAK,
// setUltraHonkBackendLoader), never artifacts.ts/ops.ts (node:fs).
export * from "./proving/index.js";
// Off-chain selective-disclosure surface. Browser-safe: prove.ts/verify.ts take
// an injected `CircuitProver`, so nothing here pulls the node-only circuit
// loader. The pinned-VK loader (`loadDisclosureVk`) is node-only → `./node`.
export * from "./disclosure/index.js";
// Offline state engine (browser-safe barrel; excludes node-only json-store,
// which is re-exported from `./node`).
export * from "./state/index.js";
