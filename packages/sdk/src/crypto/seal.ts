/**
 * X25519 sealed-box (Z2.6).
 *
 * Anonymous, one-shot encryption of a 32-byte secret scalar to a recipient's
 * X25519 wrap public key, mirroring libsodium's `crypto_box_seal`: a fresh
 * ephemeral X25519 keypair per seal, a deterministic nonce
 * `blake2b-24(ephPub ‖ recipientPub)`, and XSalsa20-Poly1305 AEAD over the
 * shared secret. The sender is anonymous (the ephemeral public key carries no
 * identity) and each seal is unlinkable (fresh ephemeral ⇒ distinct ciphertext).
 *
 * Wire layout (80 bytes): `ephPub(32) ‖ box(32 + 16 tag)`.
 */

import { xsalsa20poly1305 } from "@noble/ciphers/salsa";
import { x25519 } from "@noble/curves/ed25519";
import { blake2b } from "@noble/hashes/blake2b";

import { toBytes32BE, fromBytesBE } from "./field.js";
import type { WrapKeypair } from "./derive.js";

/** libsodium sealed-box nonce: `blake2b-24(ephPub ‖ recipientPub)`. */
function sealNonce(ephPub: Uint8Array, recipientPub: Uint8Array): Uint8Array {
  return blake2b(new Uint8Array([...ephPub, ...recipientPub]), { dkLen: 24 });
}

/**
 * Seal a 32-byte secret scalar to a recipient's X25519 wrap public key.
 * Returns the 80-byte sealed box (`ephPub ‖ box`). Anonymous and unlinkable.
 */
export function sealSecret(sk: bigint, wrapPub: Uint8Array): Uint8Array {
  if (wrapPub.length !== 32) {
    throw new RangeError("wrapPub must be a 32-byte X25519 public key");
  }
  const eph = x25519.utils.randomSecretKey();
  const ephPub = x25519.getPublicKey(eph);
  const shared = x25519.getSharedSecret(eph, wrapPub);
  const nonce = sealNonce(ephPub, wrapPub);
  const box = xsalsa20poly1305(shared, nonce).encrypt(toBytes32BE(sk));
  const out = new Uint8Array(ephPub.length + box.length);
  out.set(ephPub, 0);
  out.set(box, ephPub.length);
  return out; // 32 + 32 + 16 = 80 bytes
}

/**
 * Open a sealed box with the recipient's X25519 wrap keypair, recovering the
 * secret scalar. Throws on authentication failure (tamper or wrong key).
 */
export function unsealSecret(
  ciphertext: Uint8Array,
  wrap: Pick<WrapKeypair, "publicKey" | "secretKey">,
): bigint {
  const ephPub = ciphertext.slice(0, 32);
  const box = ciphertext.slice(32);
  const shared = x25519.getSharedSecret(wrap.secretKey, ephPub);
  const nonce = sealNonce(ephPub, wrap.publicKey);
  const pt = xsalsa20poly1305(shared, nonce).decrypt(box); // throws on auth failure
  return fromBytesBE(pt);
}
