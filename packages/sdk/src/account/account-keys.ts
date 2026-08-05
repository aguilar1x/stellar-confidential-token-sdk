/**
 * Cluster account keys (Z2.4). Builds the FROZEN public wrapper over the
 * demo-ported {@link ../crypto/keys.js} math, plus Cluster's own storage key.
 *
 * The demo persists openings in cleartext; Cluster must not. `k_store` is a
 * storage-encryption key derived from the account secret via HKDF-SHA256 with a
 * Cluster-specific `info` string, independent of the confidential-token
 * protocol keys.
 */

import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";

import { addressToField } from "../crypto/address.js";
import { H, scalarMul, pointToBytes } from "../crypto/grumpkin.js";
import { vkFromSk } from "../crypto/poseidon2.js";
import { randomScalar, toBytes32BE } from "../crypto/field.js";

/** HKDF `info` label binding `k_store` to Cluster's storage domain (v1). */
const K_STORE_INFO = "cluster/zk/storage/v1";

export interface AccountKeys {
  /** Spending public key `Y = sk · H` (64-byte on-chain point encoding). */
  Y: Uint8Array;
  /** Public viewing key `vk · H` (64-byte on-chain point encoding, = demo PVK). */
  viewingPub: Uint8Array;
  /** Contract-bound viewing key `vk = Poseidon2(VIEWING_KEY, sk, addr_f)` (sub-R). */
  viewingPriv: bigint;
  /** Cluster storage-encryption key, HKDF-SHA256 of the account secret (32 bytes). */
  kStore: Uint8Array;
}

/**
 * Derive the Cluster account key set for a secret `sk` and a token contract.
 *
 * @param sk               the account secret (sub-R scalar).
 * @param tokenContractId  the confidential-token contract's strkey address.
 */
export function deriveAccountKeys(sk: bigint, tokenContractId: string): AccountKeys {
  const addrF = addressToField(tokenContractId);
  const viewingPriv = vkFromSk(sk, addrF);
  const Y = pointToBytes(scalarMul(sk, H));
  const viewingPub = pointToBytes(scalarMul(viewingPriv, H));
  const kStore = hkdf(sha256, toBytes32BE(sk), undefined, K_STORE_INFO, 32);
  return { Y, viewingPub, viewingPriv, kStore };
}

/**
 * Generate a fresh random account secret (a nonzero sub-R scalar).
 * Per spec §5.1, v1 uses a random account secret.
 */
export function generateAccountSecret(): bigint {
  return randomScalar();
}
