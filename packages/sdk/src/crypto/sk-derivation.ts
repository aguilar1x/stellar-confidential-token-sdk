/**
 * SDK.md §5.1 — deterministic account-secret derivation.
 *
 * This is the obligation that makes a confidential-token client recoverable:
 * given the same signer root and the same (contract, account) pair, every
 * conformant client MUST arrive at the same `sk`, on any device, forever. A
 * client that instead draws `sk` randomly and stores it can never rebuild the
 * account from a seed at all, whatever the archive it replays.
 *
 * The chain, verbatim from the spec:
 *
 *   msg  = "openzeppelin/confidential-token/v1/sk" || 0x0a
 *          || enc(contract) || 0x0a || enc(account)
 *   root = Ed25519-Sign(sk_ed, SHA-256("Stellar Signed Message:\n" || msg))
 *   sk   = RS(HKDF-SHA-512(
 *            IKM  = root,
 *            salt = "openzeppelin/confidential-token/v1/sk",
 *            info = be_32(addr_f) || be_32(acct_f) || le_4(j)))
 *
 * `j` starts at 0 and increments on every rejection — both when `RS` rejects
 * the candidate (§4.7) and when the resulting `vk` would be zero, which the
 * spec additionally forbids.
 *
 * Note the domain string is used TWICE and in two different roles: as the
 * newline-delimited first line of the signed message, and as the HKDF salt.
 * That is intentional in the spec, not a transcription error.
 */

import { hkdf } from "@noble/hashes/hkdf";
import { sha512 } from "@noble/hashes/sha512";
import { sha256 } from "@noble/hashes/sha256";

import { toBytes32BE, rejectionSample } from "./field.js";
import { addressToField } from "./address.js";
import { vkFromSk } from "./poseidon2.js";

/**
 * The protocol/deployment domain string. Used as the first line of the signed
 * message AND as the HKDF salt (SDK.md §5.1).
 */
export const SK_DOMAIN = "openzeppelin/confidential-token/v1/sk";

/** SEP-0053's fixed 24-ASCII-byte signing prefix. */
export const SEP53_PREFIX = "Stellar Signed Message:\n";

/** Newline separating the message's three fields. */
const LF = 0x0a;

/**
 * Guard against a runaway derivation. Each rejection has probability well
 * under 1/2, so needing even 8 counter increments is a ~1-in-10^2 event and
 * needing 64 is impossible in practice — reaching it means the inputs or the
 * primitives are wrong, and failing loudly beats spinning.
 */
const MAX_REJECTIONS = 64;

/** ASCII-encode, asserting the string is pure ASCII (strkeys and the domain are). */
function ascii(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 0x7f) throw new Error(`expected ASCII, got U+${c.toString(16)} in ${JSON.stringify(s)}`);
    out[i] = c;
  }
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** `le_4(j)` — 4-byte little-endian encoding of the rejection counter. */
export function le4(j: number): Uint8Array {
  if (!Number.isInteger(j) || j < 0 || j > 0xffff_ffff) {
    throw new Error(`le_4 expects a uint32, got ${j}`);
  }
  return new Uint8Array([j & 0xff, (j >>> 8) & 0xff, (j >>> 16) & 0xff, (j >>> 24) & 0xff]);
}

/**
 * The SEP-0053 message a signer signs to produce their root, per §5.1:
 * `SK_DOMAIN || 0x0a || enc(contract) || 0x0a || enc(account)`.
 *
 * @param contract  the confidential-token contract's `C…` strkey.
 * @param account   the `G…` strkey of the account being registered.
 */
export function skSigningMessage(contract: string, account: string): Uint8Array {
  return concatBytes(
    ascii(SK_DOMAIN),
    new Uint8Array([LF]),
    ascii(contract),
    new Uint8Array([LF]),
    ascii(account),
  );
}

/**
 * The SEP-0053 signing payload: `SHA-256(prefix || msg)`. This 32-byte digest
 * — not the message — is what ed25519 signs, so a wallet's `signMessage` and a
 * raw `Keypair.sign` agree only if the caller hashes exactly this way.
 */
export function sep53Payload(message: Uint8Array): Uint8Array {
  return sha256(concatBytes(ascii(SEP53_PREFIX), message));
}

/** Convenience: the exact 32 bytes to sign for a (contract, account) pair. */
export function skSigningPayload(contract: string, account: string): Uint8Array {
  return sep53Payload(skSigningMessage(contract, account));
}

export interface DerivedSecret {
  /** The account secret `sk`, a nonzero element of `[1, r)`. */
  sk: bigint;
  /** The contract-bound viewing key `vk = Poseidon2(δ_vk, [sk, addr_f])`. */
  vk: bigint;
  /** How many rejections occurred; 0 in the overwhelming majority of cases. */
  j: number;
}

/**
 * Derive `sk` (and the `vk` it implies) from a signer root, per §5.1.
 *
 * @param root      the root's bytes verbatim — a 64-byte ed25519 SEP-0053
 *                  signature, or a 32-byte raw value.
 * @param addrF     `address_to_field(contract)`.
 * @param acctF     `address_to_field(account)`.
 */
export function deriveSkFromRoot(root: Uint8Array, addrF: bigint, acctF: bigint): DerivedSecret {
  if (root.length === 0) throw new Error("§5.1 root must not be empty");

  const salt = ascii(SK_DOMAIN);
  const addrBytes = toBytes32BE(addrF);
  const acctBytes = toBytes32BE(acctF);

  for (let j = 0; j <= MAX_REJECTIONS; j++) {
    const info = concatBytes(addrBytes, acctBytes, le4(j));
    const okm = hkdf(sha512, root, salt, info, 32);
    const sk = rejectionSample(okm);
    // Reject exactly as §4.7 says, and additionally when the induced vk is
    // zero — the spec requires a nonzero vk, and vk is a function of sk.
    if (sk === null) continue;
    const vk = vkFromSk(sk, addrF);
    if (vk === 0n) continue;
    return { sk, vk, j };
  }

  throw new Error(
    `§5.1 derivation failed to find an acceptable sk in ${MAX_REJECTIONS} attempts; ` +
      "the root or the field parameters are almost certainly wrong",
  );
}

/**
 * Full §5.1 derivation from strkeys: resolves both addresses to fields and
 * derives the secret. The caller supplies the root because obtaining it needs
 * a wallet (or a seed), which this layer deliberately does not touch.
 */
export function deriveSk(
  root: Uint8Array,
  contract: string,
  account: string,
): DerivedSecret & { addrF: bigint; acctF: bigint } {
  const addrF = addressToField(contract);
  const acctF = addressToField(account);
  return { ...deriveSkFromRoot(root, addrF, acctF), addrF, acctF };
}
