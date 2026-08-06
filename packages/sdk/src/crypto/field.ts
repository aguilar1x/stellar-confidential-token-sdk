/**
 * `F_r` field-element helpers (BN254 scalar field, Noir's `Field`, the Soroban
 * host's `Bn254Fr`). Everything the contract calls a "32-byte canonical
 * representative" lives here.
 */

import { FR_MODULUS, FP_MODULUS } from "./constants.js";

/**
 * Add two blinding factors as GRUMPKIN SCALARS, reducing modulo the group
 * order `p` rather than `r`.
 *
 * This is not interchangeable with {@link frAdd}, and the difference is a real
 * bug the first time an account receives two payments.
 *
 * A commitment is `v·G + r·H`, and scalar multiplication reduces the scalar
 * modulo the curve's scalar field, for Grumpkin that is `p`
 * ({@link FP_MODULUS}), not `r`. Individual blindings are `F_r` elements, so
 * they need no reduction; their SUM does not stay in `F_r`. Since `r < p`,
 * reducing a sum modulo `r` subtracts `r` where the group would have subtracted
 * nothing, and the resulting opening no longer matches the point the chain
 * accumulated. It is off by exactly `r·H`.
 *
 * Concretely: two random blindings cross `r` about half the time, so an account
 * that receives a handful of transfers is very likely to compute an opening its
 * own commitment does not verify against.
 */
export function groupAdd(a: bigint, b: bigint): bigint {
  const m = (a + b) % FP_MODULUS;
  return m < 0n ? m + FP_MODULUS : m;
}

/** Reduce into `[0, r)`. */
export function frMod(x: bigint): bigint {
  const m = x % FR_MODULUS;
  return m < 0n ? m + FR_MODULUS : m;
}

/** Field addition mod `r`. */
export function frAdd(a: bigint, b: bigint): bigint {
  return frMod(a + b);
}

/** Field subtraction mod `r`. */
export function frSub(a: bigint, b: bigint): bigint {
  return frMod(a - b);
}

/** True iff `x` is a canonical representative (`0 <= x < r`). */
export function isCanonicalFr(x: bigint): boolean {
  return x >= 0n && x < FR_MODULUS;
}

/** 32-byte big-endian encoding (the on-chain `BytesN<32>` field layout). */
export function toBytes32BE(x: bigint): Uint8Array {
  if (x < 0n || x >= 1n << 256n) {
    throw new RangeError(`value out of 256-bit range: ${x}`);
  }
  const out = new Uint8Array(32);
  let v = x;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** Decode a big-endian byte slice into a bigint. */
export function fromBytesBE(b: Uint8Array): bigint {
  let v = 0n;
  for (const byte of b) v = (v << 8n) | BigInt(byte);
  return v;
}

/** Decode a little-endian byte slice into a bigint (used by address_to_field). */
export function fromBytesLE(b: Uint8Array): bigint {
  let v = 0n;
  for (let i = b.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i]!);
  return v;
}

/** 0x-prefixed, zero-padded 32-byte hex. */
export function toHex32(x: bigint): string {
  return "0x" + frMod(x).toString(16).padStart(64, "0");
}

/** Parse 0x-prefixed (or bare) hex into a bigint. */
export function fromHex(h: string): bigint {
  return BigInt(h.startsWith("0x") || h.startsWith("0X") ? h : "0x" + h);
}

/** Lowercase hex (no 0x) for an arbitrary byte array. */
export function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (const byte of b) s += byte.toString(16).padStart(2, "0");
  return s;
}

/** Parse hex (with/without 0x) into bytes. */
export function hexToBytes(h: string): Uint8Array {
  const s = h.startsWith("0x") || h.startsWith("0X") ? h.slice(2) : h;
  if (s.length % 2 !== 0) throw new Error("odd-length hex");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * The rejection-sampling candidate step of SDK.md §4.7 / DESIGN.md §2.2.
 *
 * Takes 32 bytes, clears the top **2** bits (yielding a 254-bit candidate) and
 * returns it, or `null` if the candidate must be rejected. That is, if it is
 * `>= r`, or if it is zero and the call site requires nonzero.
 *
 * The 2-bit mask is a wire contract, not an implementation detail: §5.1 feeds
 * this HKDF output rather than CSPRNG bytes and increments a counter `j` on
 * each rejection, so a different mask width silently yields a DIFFERENT
 * account secret for the same root.
 *
 * @param bytes32   exactly 32 bytes, big-endian.
 * @param nonzero   reject a zero candidate (default `true`).
 */
export function rejectionSample(bytes32: Uint8Array, nonzero = true): bigint | null {
  if (bytes32.length !== 32) {
    throw new Error(`rejectionSample expects 32 bytes, got ${bytes32.length}`);
  }
  const masked = new Uint8Array(bytes32);
  masked[0] = (masked[0] as number) & 0x3f; // clear the top 2 bits → 254-bit
  const v = fromBytesBE(masked);
  if (v >= FR_MODULUS) return null;
  if (nonzero && v === 0n) return null;
  return v;
}

/**
 * Cryptographically-random nonzero scalar in `[1, r)`, drawn by the §4.7
 * rejection procedure: 32 CSPRNG bytes → clear the top 2 bits → accept iff in
 * `[1, r)`, else redraw.
 */
export function randomScalar(): bigint {
  for (;;) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const v = rejectionSample(bytes);
    if (v !== null) return v;
  }
}
