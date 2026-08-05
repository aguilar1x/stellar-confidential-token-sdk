/**
 * Encrypted openings channel (Z2.7).
 *
 * Symmetric AEAD over a member's per-account storage key `k_store` (32 bytes,
 * see {@link ../account/account-keys.js#deriveAccountKeys}). An {@link Opening}
 * `{ v, r }` is serialised to a fixed 64-byte plaintext (two 32-byte
 * big-endian field elements) and encrypted with XChaCha20-Poly1305 under a
 * fresh random 24-byte nonce, which is prepended to the ciphertext.
 *
 * Wire layout: `nonce(24) ‖ ct(64 + 16 tag)` = 104 bytes.
 */

import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { randomBytes } from "@noble/hashes/utils";

import type { Opening } from "../types.js";
import { toBytes32BE, fromBytesBE } from "./field.js";

/** Encrypt an opening under `k_store`. Returns `nonce ‖ ciphertext`. */
export function encryptOpening(o: Opening, kStore: Uint8Array): Uint8Array {
  if (kStore.length !== 32) {
    throw new RangeError("kStore must be a 32-byte XChaCha20 key");
  }
  const pt = new Uint8Array([...toBytes32BE(o.v), ...toBytes32BE(o.r)]); // 64 bytes
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(kStore, nonce).encrypt(pt);
  const out = new Uint8Array(24 + ct.length);
  out.set(nonce, 0);
  out.set(ct, 24);
  return out;
}

/** Decrypt an opening blob under `k_store`. Throws on tamper or wrong key. */
export function decryptOpening(blob: Uint8Array, kStore: Uint8Array): Opening {
  if (kStore.length !== 32) {
    throw new RangeError("kStore must be a 32-byte XChaCha20 key");
  }
  const nonce = blob.slice(0, 24);
  const pt = xchacha20poly1305(kStore, nonce).decrypt(blob.slice(24)); // throws on tamper
  return { v: fromBytesBE(pt.slice(0, 32)), r: fromBytesBE(pt.slice(32, 64)) };
}
