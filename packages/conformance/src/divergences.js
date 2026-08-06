/**
 * Known divergences between this implementation and SDK.md §6.1's fixtures.
 *
 * Both entries below are cases where the vendored circuits, the ones the
 * deployed testnet contracts were compiled from, implement an EARLIER form
 * than the published specification. This client matches the circuits, because a
 * client that matched the newer spec would produce proofs the deployed verifier
 * rejects. Silence about that would be the worst option: it would leave the two
 * facts unrecorded and let a reader assume conformance the code does not have.
 *
 * Each divergence is pinned by BOTH values. The suite fails if:
 *
 *   - the actual value changes (this implementation drifted), or
 *   - the fixture's expected value changes (the spec moved again), or
 *   - the two become equal (the circuits were regenerated, at which point the
 *     divergence must be deleted and the primitive promoted to conforming).
 *
 * A test that merely skipped these would go green while coverage silently
 * shrank, which is precisely the failure §6.1 exists to prevent.
 */

/**
 * Empty, and that is the point.
 *
 * Two entries lived here, `ecdh` and `encrypt_auditor_sender_balance`, for as
 * long as the verifier this project deployed against had been built from
 * circuits that predate OpenZeppelin's L-03 (#778) and N-07 (#792) fixes. That
 * deployment was ours, made 2026-07-03, thirteen days before those fixes
 * merged; the client matched it deliberately and recorded the mismatch rather
 * than claiming a conformance it did not have.
 *
 * The circuits were rebuilt from the post-fix source and the contracts
 * redeployed, so both primitives now reproduce byte-for-byte and the entries
 * were deleted, which is exactly what the convergence check below demanded:
 * a divergence that has closed must not be left standing as a stale excuse.
 */
export const KNOWN_DIVERGENCES = {};

/**
 * Domain tags this implementation assigns differently from DESIGN_cont.md §13.
 *
 * Empty as of the redeploy. The one entry that lived here recorded tag 13 held
 * by `DOMAIN.DISCLOSURE`, which is `delta_ecdh`'s value upstream, a fact this
 * project had inverted, reading its own staleness as a collision caused by
 * someone else. §13 assigns 13 to delta_ecdh, 14 to delta_eph, 15 to
 * delta_disc_bind and 16 to delta_disc; tags 1-12 always matched, and all four
 * now do.
 */
export const DOMAIN_COLLISIONS = [];
