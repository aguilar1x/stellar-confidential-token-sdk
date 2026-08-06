/**
 * Wire types for the off-chain selective-disclosure protocol
 * (SELECTIVE_DISCLOSURE.md §5). Everything here is JSON: field elements are
 * 0x-prefixed 32-byte hex, points are `{ x, y }` hex pairs. These objects are
 * what the two parties copy/paste (or POST) between each other, they never
 * touch the chain.
 *
 * Ported from the demo `@ctd/sdk` `disclosure/types.ts`. The one adaptation for
 * `stellar-confidential-token-sdk`: the demo imported `EventRef`/`TransferEvent` from a
 * network-bound `chain/events.ts`. `stellar-confidential-token-sdk` (Z2) does NO RPC, so the
 * disclosure event shape lives here as {@link DisclosureEvent}, just the
 * transfer fields the prover consumes, and the caller (API/web) is responsible
 * for resolving on-chain events and passing them in.
 */

import type { Point } from "../crypto/grumpkin.js";

/** D-recipient (§6): "this on-chain payment paid me this amount". */
export const DISCLOSE_RECIPIENT_CIRCUIT_ID = "disclose_recipient";
/** D-sender (§7): "this on-chain payment was sent by me for this amount". */
export const DISCLOSE_SENDER_CIRCUIT_ID = "disclose_sender";

export type DisclosureCircuitId =
  | typeof DISCLOSE_RECIPIENT_CIRCUIT_ID
  | typeof DISCLOSE_SENDER_CIRCUIT_ID;

export const DISCLOSURE_CIRCUIT_IDS: readonly DisclosureCircuitId[] = [
  DISCLOSE_RECIPIENT_CIRCUIT_ID,
  DISCLOSE_SENDER_CIRCUIT_ID,
];

export interface JsonPoint {
  x: string;
  y: string;
}

/**
 * Source-independent reference to the on-chain event a bundle discloses. The
 * verifier re-resolves this to the single token-contract event it names (out
 * of band, off the `stellar-confidential-token-sdk` critical path) and feeds the resolved fields
 * into `verifyDisclosure` via its `ctx`.
 */
export interface EventRef {
  ledger: number;
  id: string;
  txHash: string;
}

/**
 * The transfer-event fields the disclosure prover consumes. In the demo these
 * were carried by the richer `TransferEvent` from `chain/events.ts`; here they
 * are named explicitly so `stellar-confidential-token-sdk` stays free of any RPC/event-decoding
 * dependency. `from`/`to` identify the disclosing accounts; `ref` is attached
 * so the produced bundle can name the event.
 */
export interface DisclosureEvent {
  ref: EventRef;
  from: string;
  to: string;
  rE: Point;
  sigma: bigint;
  vTilde: bigint;
}

/**
 * What the disclosure recipient sends to the holder (§12 step 1): their
 * long-lived Grumpkin pubkey and a fresh per-request nonce. `(pR, nu)` binds
 * the resulting proof to this recipient and this request. The request is
 * circuit-agnostic, which claim the prover can make (received vs. sent) is
 * dictated by their relation to the event; the bundle's `circuitId` declares
 * it and pins the VK the verifier loads (§5.2).
 */
export interface DisclosureRequest {
  pR: JsonPoint;
  nu: string;
}

/**
 * What the holder returns (§5.2): the proof, the event reference, and the
 * recipient-bound disclosure ciphertext. Deliberately NOT included: the event
 * payload, the disclosing account, or any other public input, the verifier
 * reconstructs those from chain state (§5.2 trust-boundary rule).
 */
export interface DisclosureBundle {
  circuitId: DisclosureCircuitId;
  refE: EventRef;
  /** UltraHonk proof bytes, hex. */
  proof: string;
  /** Disclosure ciphertext (§4): ephemeral key + sealed value. */
  rDisc: JsonPoint;
  vTildeDisc: string;
}

/** Recipient-side secret material, persisted by the verifying party only. */
export interface RecipientKeys {
  /** Secret scalar `r_R`. Never leaves the recipient. */
  rR: bigint;
  /** Published pubkey `P_R = r_R · H` as hex (what goes into requests). */
  pR: JsonPoint;
}
