/**
 * Node-only subpath for `stellar-confidential-token-sdk` (`stellar-confidential-token-sdk/node`). Everything here
 * reaches `node:fs` — the vendored-circuit / pinned-VK loaders, the prove ops
 * that read those circuits, and the JSON file store — and so is kept OFF the
 * browser-safe main barrel ({@link ./index.ts}). A browser build (Z5) supplies
 * its own vendored-artifact path and never imports this entry.
 */

// Vendored compiled-circuit + pinned-VK loaders (node:fs).
export {
  loadCircuit,
  loadDisclosureVk,
  type CircuitName,
  type DisclosureCircuitName,
} from "./proving/artifacts.js";

// Prove ops that load vendored circuits via `loadCircuit` (→ node:fs).
export {
  proveRegister,
  proveTransfer,
  proveWithdraw,
  type TransferEnvelope,
} from "./proving/ops.js";

// Node-only JSON-file state store.
export { JsonFileStore } from "./state/json-store.js";
