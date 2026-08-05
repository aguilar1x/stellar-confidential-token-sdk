/**
 * Known divergences between this implementation and SDK.md §6.1's fixtures.
 *
 * Both entries below are cases where the vendored circuits — the ones the
 * deployed testnet contracts were compiled from — implement an EARLIER form
 * than the published specification. This client matches the circuits, because a
 * client that matched the newer spec would produce proofs the deployed verifier
 * rejects. Silence about that would be the worst option: it would leave the two
 * facts unrecorded and let a reader assume conformance the code does not have.
 *
 * Each divergence is pinned by BOTH values. The suite fails if:
 *
 *   - the actual value changes (this implementation drifted), or
 *   - the fixture's expected value changes (the spec moved again), or
 *   - the two become equal (the circuits were regenerated — at which point the
 *     divergence must be deleted and the primitive promoted to conforming).
 *
 * A test that merely skipped these would go green while coverage silently
 * shrank, which is precisely the failure §6.1 exists to prevent.
 */

export const KNOWN_DIVERGENCES = {
  ecdh: {
    since: "vendored circuits predate the Poseidon2 form",
    specSays:
      "ecdh = Poseidon2(delta_ecdh, S.x, S.y) with S = s*P, absorbing BOTH coordinates",
    weDo: "ecdh = (s*P).x — the x-coordinate alone",
    whyItMatters:
      "An x-only shared secret is invariant under point negation: P and -P " +
      "derive the SAME secret, because they share an x-coordinate. The " +
      "specification absorbs y precisely to remove that invariance.",
    blockedBy:
      "The deployed verifier was compiled from circuits using the x-only form. " +
      "A client emitting the Poseidon2 form would produce proofs it rejects. " +
      "Closing this needs regenerated circuits and a redeployed verifier.",
    expected: "0x105fa0a0e003bf2072dff4e53da5a288bee77e894392ada1ac6ae99bb2b8568b",
    actual: "0x114ed4fcf2c57014eb678c577aa02f30ef590b713d7a6a5e87702d1c7f71957f",
  },

  encrypt_auditor_sender_balance: {
    since: "vendored circuits use the first squeeze slot",
    specSays:
      "b_tilde_aud_s = v_new + SpongeSqueeze_2(AUDITOR_SENDER, s_a_s, sigma)[1] — the SECOND squeeze",
    weDo:
      "b_tilde_aud_s = v_new + Poseidon2(AUDITOR_SENDER, s_a_s, sigma), which is the FIRST squeeze slot",
    whyItMatters:
      "The fixture states the reason outright: the first-squeeze slot is the " +
      "AMOUNT pad, and it is left unused here 'so the checkpoint pad never " +
      "coincides with an amount pad, even under (r_e, sigma) reuse'. Using the " +
      "amount slot reintroduces exactly that collision — two values masked by " +
      "the same pad differ by their plaintext difference once subtracted.",
    blockedBy:
      "The vendored withdraw circuit accepts the first-squeeze form and would " +
      "reject the second. Verified by proving a withdraw against the real " +
      "circuit: it self-verifies with the current implementation.",
    expected: "0x27f3739a132c6353cd5af3edac0ac75faf7fc606acb61367774e4f764ec17f5f",
    actual: "0x2787d1e01bbca7828e13e9b2b3fa11cfcfe9c3d2b121b9e17543146822fe23d3",
  },
};

/**
 * Domain-tag assignments this implementation uses that the specification
 * assigns elsewhere. Recovered from the fixtures rather than assumed: the
 * `ecdh` vector is only reproducible with domain 13, which pins delta_ecdh.
 */
export const DOMAIN_COLLISIONS = [
  {
    tag: 13,
    specUses: "delta_ecdh (recovered from ecdh.json — no other tag reproduces the vector)",
    weUse: "DOMAIN.DISCLOSURE",
    whyItMatters:
      "Domain separation exists so two primitives can never produce the same " +
      "hash from the same field elements. This implementation's own comment " +
      "says the disclosure tag 'continues the on-chain tag list to stay " +
      "collision-free' — the intent was right, the tag was already taken.",
  },
];
