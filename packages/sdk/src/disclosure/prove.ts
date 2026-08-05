/**
 * Holder-side disclosure proving (SELECTIVE_DISCLOSURE.md §12 steps 2–4):
 * take a recipient's request `(P_R, nu)` and a `Transfer` event, produce the
 * proof bundle to hand back. One entry point per role:
 *
 *   - proveRecipientDisclosure — the event paid me (D-recipient, §6)
 *   - proveSenderDisclosure    — I sent the event (D-sender, §7; r_e is
 *                                re-derived from vk + the event's sigma, §15.2)
 *
 * `proveDisclosure` is the frozen `stellar-confidential-token-sdk` surface: a thin dispatcher over
 * the two role builders (default recipient).
 *
 * Pure orchestration over the witness builders + prover; the heavy lifting
 * (ECDH decrypt, U-block) is in witness/disclose-{recipient,sender}.ts.
 */

import type { KeyPair } from "../crypto/keys.js";
import type { Point } from "../crypto/grumpkin.js";
import { fromHex, toHex32, bytesToHex } from "../crypto/field.js";
import type { CircuitProver } from "../proving/prover.js";
import { buildDiscloseRecipientWitness } from "../witness/disclose-recipient.js";
import { buildDiscloseSenderWitness } from "../witness/disclose-sender.js";
import {
  DISCLOSE_RECIPIENT_CIRCUIT_ID,
  DISCLOSE_SENDER_CIRCUIT_ID,
  type DisclosureBundle,
  type DisclosureCircuitId,
  type DisclosureEvent,
  type DisclosureRequest,
  type EventRef,
} from "./types.js";
import { pointFromJson, pointToJson } from "./recipient.js";

/** Derive the source-independent {@link EventRef} for a resolved event. */
function eventRef(event: DisclosureEvent): EventRef {
  return event.ref;
}

export async function proveRecipientDisclosure(params: {
  /** Holder's key set — must be the event's `to` account. */
  keys: KeyPair;
  /** The inbound transfer event being disclosed. */
  event: DisclosureEvent;
  /** The recipient's request, received out-of-band. */
  request: DisclosureRequest;
  /** Prover over the shared `disclose_recipient` artifact. */
  prover: CircuitProver;
}): Promise<DisclosureBundle> {
  const { keys, event, request, prover } = params;
  const w = buildDiscloseRecipientWitness({
    keys,
    event: { rE: event.rE, sigma: event.sigma, vTilde: event.vTilde },
    pR: pointFromJson(request.pR),
    nu: fromHex(request.nu),
  });
  const { proof } = await prover.prove(w.inputs);
  return bundle(DISCLOSE_RECIPIENT_CIRCUIT_ID, event, proof, w);
}

export async function proveSenderDisclosure(params: {
  /** Originator's key set — must be the event's `from` account. */
  keys: KeyPair;
  /** The transfer's ephemeral scalar, re-derived via `deriveEphemeralRE` (§15.2). */
  rEScalar: bigint;
  /** The outbound transfer event being disclosed. */
  event: DisclosureEvent;
  /** Transfer recipient's stored viewing key (read from the account at `E.to`). */
  pvkB: Point;
  /** The recipient's request, received out-of-band. */
  request: DisclosureRequest;
  /** Prover over the shared `disclose_sender` artifact. */
  prover: CircuitProver;
}): Promise<DisclosureBundle> {
  const { keys, rEScalar, event, pvkB, request, prover } = params;
  const w = buildDiscloseSenderWitness({
    keys,
    rEScalar,
    event: { rE: event.rE, sigma: event.sigma, vTilde: event.vTilde },
    pvkB,
    pR: pointFromJson(request.pR),
    nu: fromHex(request.nu),
  });
  const { proof } = await prover.prove(w.inputs);
  return bundle(DISCLOSE_SENDER_CIRCUIT_ID, event, proof, w);
}

/** Discriminant for {@link proveDisclosure}: which role is being disclosed. */
export type DisclosureRole = "recipient" | "sender";

/**
 * The frozen `stellar-confidential-token-sdk` disclosure-proving surface: dispatch to the right
 * role builder from a single params object. `role` defaults to `"recipient"`;
 * `"sender"` additionally requires the ephemeral scalar `rEScalar` and the
 * transfer recipient's `pvkB` (§7).
 */
export function proveDisclosure(
  params: {
    role?: "recipient";
    keys: KeyPair;
    event: DisclosureEvent;
    request: DisclosureRequest;
    prover: CircuitProver;
  },
): Promise<DisclosureBundle>;
export function proveDisclosure(
  params: {
    role: "sender";
    keys: KeyPair;
    rEScalar: bigint;
    event: DisclosureEvent;
    pvkB: Point;
    request: DisclosureRequest;
    prover: CircuitProver;
  },
): Promise<DisclosureBundle>;
export function proveDisclosure(params: {
  role?: DisclosureRole;
  keys: KeyPair;
  rEScalar?: bigint;
  event: DisclosureEvent;
  pvkB?: Point;
  request: DisclosureRequest;
  prover: CircuitProver;
}): Promise<DisclosureBundle> {
  if (params.role === "sender") {
    if (params.rEScalar === undefined || params.pvkB === undefined) {
      throw new Error("proveDisclosure(sender): rEScalar and pvkB are required");
    }
    return proveSenderDisclosure({
      keys: params.keys,
      rEScalar: params.rEScalar,
      event: params.event,
      pvkB: params.pvkB,
      request: params.request,
      prover: params.prover,
    });
  }
  return proveRecipientDisclosure({
    keys: params.keys,
    event: params.event,
    request: params.request,
    prover: params.prover,
  });
}

function bundle(
  circuitId: DisclosureCircuitId,
  event: DisclosureEvent,
  proof: Uint8Array,
  w: { rDisc: Point; vTildeDisc: bigint },
): DisclosureBundle {
  return {
    circuitId,
    refE: eventRef(event),
    proof: "0x" + bytesToHex(proof),
    rDisc: pointToJson(w.rDisc),
    vTildeDisc: toHex32(w.vTildeDisc),
  };
}
