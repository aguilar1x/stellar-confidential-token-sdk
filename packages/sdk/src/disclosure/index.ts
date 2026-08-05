// Off-chain selective-disclosure layer (SELECTIVE_DISCLOSURE.md).
// Holder side: proveDisclosure (+ proveRecipientDisclosure / proveSenderDisclosure).
// Receiver side: generateRecipientKeys, newDisclosureRequest, verifyDisclosure.
// Both sides load the SAME circuit artifact + VK by circuit_id (§5.5
// shared-artifact rule). Browser-safe: no node:fs here — the pinned VK is loaded
// via the node-only `loadDisclosureVk` in proving/artifacts.ts.
export * from "./types.js";
export * from "./recipient.js";
export * from "./prove.js";
export * from "./verify.js";
