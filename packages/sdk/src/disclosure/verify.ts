/**
 * Disclosure-receiver verification — the mandatory §5.3 protocol from
 * SELECTIVE_DISCLOSURE.md, for the D-recipient (§6) and D-sender (§7)
 * circuits.
 *
 * The trust-boundary rule (§5.2) is load-bearing here: the ONLY bundle values
 * that enter the public-input vector are `(R_disc, v_tilde_disc)`. Everything
 * else — the event fields, the disclosing accounts' PVKs, `addr_f` — is
 * resolved independently from the chain, and `(P_R, nu)` come from the
 * verifier's OWN request record, never from the prover.
 *
 * PORT NOTE (`stellar-confidential-sdk`, Z2 does NO RPC): the demo's `verifyDisclosure`
 * fetched three things from a live `ChainClient` — the event (via
 * `hybridResolveEventRef`), `PVK_A` (via `confidentialBalance(disclosingAccount)`),
 * and, for D-sender, `PVK_B` (via `confidentialBalance(event.to)`) — and derived
 * `addr_f` from `client.cfg.contracts.token`. Those FOUR network/config lookups
 * are the ONLY things replaced here: they are injected pre-resolved via
 * {@link DisclosureVerifyContext} (`ctx`). Every CRYPTO/VERIFICATION step is
 * kept intact and in the same order: request-key binding → VK pinning
 * (getVerificationKey({keccak:true}) byte-compared vs `ctx.pinnedVk`) →
 * public-input construction in the circuit's exact order → UltraHonk
 * `verifyProof` (keccak) → decrypt with the §5.3 range guard.
 */

import { fromHex, toHex32, hexToBytes } from "../crypto/field.js";
import { pointCoords, type Point } from "../crypto/grumpkin.js";
import type { CircuitProver } from "../proving/prover.js";
import {
  DISCLOSE_SENDER_CIRCUIT_ID,
  DISCLOSURE_CIRCUIT_IDS,
  type DisclosureBundle,
  type DisclosureRequest,
  type RecipientKeys,
} from "./types.js";
import { pointFromJson, decryptDisclosure } from "./recipient.js";

/** Which §5.3 step a rejection happened at (§15.3: typed errors). */
export type VerifyStage =
  | "vk-pinning"
  | "resolve-event"
  | "resolve-account"
  | "verify-proof"
  | "decrypt";

export class DisclosureVerifyError extends Error {
  constructor(
    readonly stage: VerifyStage,
    message: string,
  ) {
    super(`[${stage}] ${message}`);
    this.name = "DisclosureVerifyError";
  }
}

export interface VerifiedDisclosure {
  ok: true;
  /** The disclosed amount — trustworthy as the chain itself (§1.1). */
  amount: bigint;
  /** What was proven: the disclosing party received or sent the payment. */
  role: "recipient" | "sender";
  /** The account the proof binds to (`E.to` for recipient, `E.from` for sender). */
  disclosingAccount: string;
  /** Human-readable trace of each verifier step, for display. */
  steps: string[];
}

/**
 * The pre-resolved on-chain / config inputs the demo's verifier fetched over
 * RPC. `stellar-confidential-sdk` performs NO network I/O, so the caller (API/web) resolves
 * these — event fields, disclosing-account PVK(s), the token `addr_f`, and the
 * pinned VK — and passes them in. Which account each PVK is read from is
 * dictated by the bundle's variant + the event payload (§5.3 step 2): `E.to`
 * for D-recipient (`pvkA`); `E.from` (originator, `pvkA`) plus `E.to` (transfer
 * recipient, `pvkB`) for D-sender.
 */
export interface DisclosureVerifyContext {
  /** `addr_f` = token contract address as a field element. */
  addrF: bigint;
  /** Event `R_e` resolved from `bundle.refE`. */
  rE: Point;
  /** Event `sigma` resolved from `bundle.refE`. */
  sigma: bigint;
  /** Event `v_tilde` resolved from `bundle.refE`. */
  vTilde: bigint;
  /** PVK of the disclosing account (`E.to` recipient / `E.from` sender). */
  pvkA: Point;
  /** For D-sender only: PVK of the transfer recipient (`E.to`). */
  pvkB?: Point;
  /**
   * Pinned verification key for the BUNDLE's circuit_id (the raw VK bytes, i.e.
   * base64-decoded `<circuit>.vk.json` `vkBase64`). When given, the VK derived
   * from the loaded circuit bytecode must match byte-for-byte — the §5.5
   * "circuit_id → audited circuit" agreement made checkable.
   */
  pinnedVk?: Uint8Array;
  /** Resolved disclosing account address, for the returned trace (optional). */
  disclosingAccount?: string;
}

/**
 * Verify a disclosure bundle against pre-resolved on-chain context. Returns
 * `{ ok, amount }` (the frozen `stellar-confidential-sdk` surface); throws
 * {@link DisclosureVerifyError} on any §5.3 failure. `ok` is always `true` when
 * it returns — a failed proof or out-of-range decrypt throws rather than
 * returning `{ ok: false }`, so callers get the failing stage.
 */
export async function verifyDisclosure(
  bundle: DisclosureBundle,
  ctx: DisclosureVerifyContext & {
    /** The verifier's own request this bundle answers — NOT taken from the bundle. */
    request: DisclosureRequest;
    /** The verifier's keypair (request.pR must be its public half). */
    keys: RecipientKeys;
    /** Prover/verifier over the shared artifact for the BUNDLE's circuit_id. */
    prover: CircuitProver;
  },
): Promise<VerifiedDisclosure & { ok: true }> {
  const { request, keys, prover, pinnedVk } = ctx;
  const steps: string[] = [];

  if (!DISCLOSURE_CIRCUIT_IDS.includes(bundle.circuitId)) {
    throw new DisclosureVerifyError("vk-pinning", `unknown circuit_id "${bundle.circuitId}"`);
  }
  const isSender = bundle.circuitId === DISCLOSE_SENDER_CIRCUIT_ID;
  if (request.pR.x !== keys.pR.x || request.pR.y !== keys.pR.y) {
    throw new DisclosureVerifyError("decrypt", "request was not issued under this recipient key");
  }
  if (isSender && !ctx.pvkB) {
    throw new DisclosureVerifyError(
      "resolve-account",
      "D-sender verification requires the transfer recipient's PVK_B in ctx",
    );
  }

  // §5.5 — pin the verification key before trusting any verify result.
  if (pinnedVk) {
    const vk = await prover.verificationKey();
    if (vk.length !== pinnedVk.length || !vk.every((b, i) => b === pinnedVk[i])) {
      throw new DisclosureVerifyError(
        "vk-pinning",
        `circuit artifact does not match the pinned "${bundle.circuitId}" verification key`,
      );
    }
    steps.push(
      `VK pinned: ${bundle.circuitId} artifact matches the shared ${vk.length}B verification key`,
    );
  }

  // §5.3 steps 1–3 — event, account PVK(s), and addr_f come pre-resolved in
  // `ctx` (the demo fetched these over RPC; Z2 does not). The trust-boundary
  // rule is preserved: `ctx` carries CHAIN-resolved values, the bundle carries
  // only (R_disc, v_tilde_disc).
  const disclosingAccount = ctx.disclosingAccount ?? (isSender ? "E.from" : "E.to");
  steps.push(
    `Using pre-resolved event + ${isSender ? "sender (E.from)" : "recipient (E.to)"} PVK from ctx`,
  );

  // §5.3 step 4 — public inputs, in the circuit's exact order. Bundle values
  // used: R_disc and v_tilde_disc only.
  const pvkA = pointCoords(ctx.pvkA);
  const pvkB = ctx.pvkB ? pointCoords(ctx.pvkB) : null;
  const rE = pointCoords(ctx.rE);
  const publicInputs = [
    toHex32(ctx.addrF),
    toHex32(pvkA.x),
    toHex32(pvkA.y),
    toHex32(rE.x),
    toHex32(rE.y),
    toHex32(ctx.sigma),
    toHex32(ctx.vTilde),
    ...(pvkB ? [toHex32(pvkB.x), toHex32(pvkB.y)] : []),
    request.pR.x,
    request.pR.y,
    request.nu,
    bundle.rDisc.x,
    bundle.rDisc.y,
    bundle.vTildeDisc,
  ].map((h) => toHex32(fromHex(h)));
  steps.push("Constructed the public-input vector from ctx state + own (P_R, ν)");

  // §5.3 step 5 — UltraHonk verification.
  const ok = await prover.verify({ proof: hexToBytes(bundle.proof), publicInputs });
  if (!ok) {
    throw new DisclosureVerifyError("verify-proof", "UltraHonk proof verification failed");
  }
  steps.push("UltraHonk proof verified against the reconstructed public inputs");

  // §5.3 step 6 — decrypt the sealed value.
  const amount = decryptDisclosure(
    keys.rR,
    pointFromJson(bundle.rDisc),
    fromHex(bundle.vTildeDisc),
    fromHex(request.nu),
  );
  if (amount >= 1n << 127n) {
    throw new DisclosureVerifyError("decrypt", "decrypted value out of range — wrong recipient key?");
  }
  steps.push(`Decrypted ṽ_disc with r_R and ν → amount ${amount}`);

  return {
    ok: true,
    amount,
    role: isSender ? "sender" : "recipient",
    disclosingAccount,
    steps,
  };
}
