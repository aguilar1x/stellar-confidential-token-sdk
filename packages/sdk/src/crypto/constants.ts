/**
 * Cross-language constants shared with the Noir circuits and the on-chain
 * contract. Every value here is a hard contract: if any of these diverges from
 * `circuits/lib/src/lib.nr` (generators, domain tags, IV base) or from the
 * Soroban host's field (the BN254 scalar field `F_r`), proofs silently fail to
 * verify or — worse — verify against the wrong statement.
 *
 * Source of truth:
 *   OpenZeppelin/stellar-contracts @ feat/confidential-verifier-ultrahonk
 *   packages/tokens/src/confidential/circuits/lib/src/lib.nr
 */

// ---------------------------------------------------------------------------
// Field moduli
// ---------------------------------------------------------------------------

/**
 * BN254 scalar field order `r`. This is Noir's native `Field` modulus and the
 * Grumpkin **base** field (point coordinates live here). The Soroban host's
 * `Bn254Fr` is this field; "canonical" means a 32-byte big-endian value `< r`.
 */
export const FR_MODULUS =
  0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;

/**
 * BN254 base field order `p`. This is the Grumpkin **scalar** field — the
 * modulus that scalars are reduced by during point multiplication.
 *
 * Note `r < p`, so every `F_r` element (key material, blinding factors, salts —
 * all in `[0, r)`) is already a valid Grumpkin scalar with no reduction. That
 * is exactly why a Noir `Field` can be fed to `multi_scalar_mul` unambiguously.
 */
export const FP_MODULUS =
  0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47n;

// ---------------------------------------------------------------------------
// Grumpkin generators (Barretenberg "DEFAULT_DOMAIN_SEPARATOR", indices 0/1)
// ---------------------------------------------------------------------------
//
// These are derive_generators("DEFAULT_DOMAIN_SEPARATOR", ...) outputs, so
// `commit(v, r) = v*G + r*H` is identical to Barretenberg's
// `pedersen_commitment([v, r])`. There is NO known discrete-log relation
// between G and H (do NOT assume H = k*G as some older designs did).

/** Pedersen generator G (index 0). */
export const G_X =
  0x083e7911d835097629f0067531fc15cafd79a89beecb39903f69572c636f4a5an;
export const G_Y =
  0x1a7f5efaad7f315c25a918f30cc8d7333fccab7ad7c90f14de81bcc528f9935dn;

/** Pedersen generator H (index 1). */
export const H_X =
  0x054aa86a73cb8a34525e5bbed6e43ba1198e860f5f3950268f71df4591bde402n;
export const H_Y =
  0x209dcfbf2cfb57f9f6046f44d71ac6faf87254afc7407c04eb621a6287cac126n;

// ---------------------------------------------------------------------------
// Poseidon2 sponge
// ---------------------------------------------------------------------------

/** IV multiplier: `iv = (input_length) * 2^64`, placed at the capacity slot. */
export const POSEIDON2_IV_BASE = 1n << 64n; // 2^64 = 18446744073709551616

// ---------------------------------------------------------------------------
// Domain separation tags (lib.nr `mod domain`). The integer IS the wire
// contract: it is the first element absorbed by every Poseidon2 call.
// ---------------------------------------------------------------------------

export const DOMAIN = {
  /** address_to_field(a) = Poseidon2(ADDRESS, lo, hi). */
  ADDRESS: 1n,
  /** vk = Poseidon2(VIEWING_KEY, sk, addr_f). */
  VIEWING_KEY: 2n,
  /** dvk = Poseidon2(DELEGATION_VIEWING_KEY, vk, op_i). */
  DELEGATION_VIEWING_KEY: 3n,
  /** r' = Poseidon2(SPEND_RANDOMNESS, vk, sigma). */
  SPEND_RANDOMNESS: 4n,
  /** r_tx = Poseidon2(TX_BLINDING, s, sigma). */
  TX_BLINDING: 5n,
  /** v_tilde = v_tx + Poseidon2(TX_AMOUNT, s, sigma). */
  TX_AMOUNT: 6n,
  /** b_tilde = v_new + Poseidon2(ENCRYPTED_BALANCE, vk, sigma). */
  ENCRYPTED_BALANCE: 7n,
  /** a_tilde = v_a + Poseidon2(ENCRYPTED_ALLOWANCE, dvk, sigma_a). */
  ENCRYPTED_ALLOWANCE: 8n,
  /** r_a = Poseidon2(ALLOWANCE_RANDOMNESS, dvk, sigma_a). */
  ALLOWANCE_RANDOMNESS: 9n,
  /** escrowed_dvk = dvk + Poseidon2(ESCROWED_DELEGATION_VIEWING_KEY, s, op_i). */
  ESCROWED_DELEGATION_VIEWING_KEY: 10n,
  /** Sender / owner-auditor channel tag. */
  AUDITOR_SENDER: 11n,
  /** Recipient-auditor channel tag. */
  AUDITOR_RECIPIENT: 12n,
  /**
   * ECDH shared-secret scalar extraction, DESIGN.md §2.4:
   * `s = Poseidon2(ECDH_SHARED_SECRET, S.x, S.y)`.
   *
   * Absent from this table until the verifier was rebuilt from post-fix
   * circuits, because the x-only construction it replaced absorbs no domain at
   * all. DESIGN_cont.md §13 assigns 13; sweeping tags 11–16 against
   * OpenZeppelin's `ecdh` fixture confirms it independently — no other value
   * reproduces the vector.
   */
  ECDH_SHARED_SECRET: 13n,
  /**
   * Off-chain selective-disclosure ciphertext to a disclosure recipient:
   * `v_tilde_disc = v_tx + Poseidon2(DISCLOSURE, S_disc.x, nu)`.
   * SELECTIVE_DISCLOSURE.md §2.2 / §4 (`delta_disc`), which takes its value
   * from DESIGN_cont.md §13. Was 13 here, from before that table existed —
   * which is `delta_ecdh`'s value.
   */
  DISCLOSURE: 16n,
  /**
   * Aggregate-disclosure nonce binding (`delta_disc_bind`). Reserved, unused.
   * DESIGN_cont.md §13 assigns 15; it previously sat at 14 here, which is
   * `delta_eph`'s value upstream.
   */
  DISCLOSURE_BIND: 15n,
  /**
   * Wallet-side deterministic ephemeral scalar:
   * `r_e = Poseidon2(EPHEMERAL_KEY, vk, sigma)` — DESIGN.md §5.3, and
   * `delta_eph = 14` in DESIGN_cont.md §13.
   *
   * This was 15, chosen by continuing this file's own list rather than reading
   * that table, and it was wrong in the way the specification warns about
   * rather than in a way anything would catch. No circuit constrains `r_e` —
   * only `R_e = r_e·H` and `r_e != 0` are — so proofs built with the wrong tag
   * verify exactly like proofs built with the right one. SDK.md §6.3 is
   * explicit about the consequence: "a fixture is the only mechanism keeping a
   * user's clients in agreement; where two disagree, transfers sent from one
   * are not disclosable from the other."
   *
   * Because it is unconstrained, correcting it costs nothing against the
   * deployed verifier. It does mean transfers this client sent before the
   * correction cannot have their `r_e` recomputed by it — which is precisely
   * the failure being fixed, observed once on our own history.
   */
  EPHEMERAL_KEY: 14n,
} as const;

/** Verifier circuit-type discriminants (verifier/mod.rs `CircuitType`). */
export const CIRCUIT_TYPE = {
  Register: 0,
  Withdraw: 1,
  Transfer: 2,
  SpenderTransfer: 3,
  SetSpender: 4,
  RevokeSpender: 5,
} as const;

export type CircuitTypeName = keyof typeof CIRCUIT_TYPE;
