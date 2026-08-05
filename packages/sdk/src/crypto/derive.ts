/**
 * Wallet-signature key derivation (Z2.5).
 *
 * A member proves control of their Stellar wallet by signing a fixed,
 * deployment-bound message; the resulting ed25519 signature is deterministic,
 * so it seeds an X25519 wrap keypair used to wrap per-member secrets. See spec
 * §5.1: `ed25519 sig → seed = SHA-512(sig)[0:32] → X25519 keypair`.
 */

import { sha512 } from "@noble/hashes/sha512";
import { x25519 } from "@noble/curves/ed25519";

import { fromBytesBE, frMod } from "./field.js";

export interface WrapKeypair {
  /** X25519 public key (32 bytes). */
  publicKey: Uint8Array;
  /** X25519 secret key (32 bytes; x25519 clamps internally). */
  secretKey: Uint8Array;
}

/**
 * Derive an X25519 wrap keypair from a deterministic wallet signature.
 *
 * The seed is `SHA-512(walletSig)[0:32]`, used directly as the X25519 secret
 * key (x25519 clamps the scalar internally, so no manual clamping is needed).
 */
export function deriveWrapKeypair(walletSig: Uint8Array): WrapKeypair {
  const seed = sha512(walletSig).slice(0, 32); // 32-byte X25519 secret
  const publicKey = x25519.getPublicKey(seed);
  return { publicKey, secretKey: seed };
}

/**
 * The deployment-bound message a member signs to derive their wrap key. Z5
 * calls `wallet.signMessage(wrapKeyMessage(tokenContractId))`.
 */
export function wrapKeyMessage(tokenContractId: string): string {
  return `cluster:confidential:wrap-key:v1:${tokenContractId}`;
}

/**
 * Optional deterministic account-secret helper: reduce `SHA-512(sig)[0:32]`
 * into `[1, r)`. NOT used by v1 (which uses a random account secret per
 * {@link ../account/account-keys.js#generateAccountSecret}); kept for callers
 * that want a signature-deterministic secret.
 */
export function skFromSignature(walletSig: Uint8Array): bigint {
  const seed = sha512(walletSig).slice(0, 32);
  const reduced = frMod(fromBytesBE(seed));
  // Map the (astronomically unlikely) zero to 1 so the scalar is nonzero.
  return reduced === 0n ? 1n : reduced;
}
