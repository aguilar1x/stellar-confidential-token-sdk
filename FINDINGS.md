# What building this surfaced

Five defects, found by implementing `SDK.md` and `INDEXER.md` rather than by
reading them. Two are OpenZeppelin's own audit findings that have not reached
their deployment; two are original to this work; one is a gap in the published
material that this repository fills.

The [README](./README.md) summarises them. This is the detail.

---

## Conformance, honestly

15 of the 17 published primitives reproduce **byte-for-byte**. Two do not, and
what they reveal is worth more than a clean sweep would have been:

| Primitive | Specification | This client |
|---|---|---|
| `ecdh` | `Poseidon2(δ_ecdh, S.x, S.y)` | `(s·P).x` |
| `encrypt_auditor_sender_balance` | second sponge squeeze | first squeeze |

Both were tested against the real circuits. The vendored withdraw circuit
**accepts** the first-squeeze form, and the live transfer against the deployed
contract works with x-only ECDH. So the finding is not about this client.

### 1 & 2 · The deployed verifier predates OpenZeppelin's own fixes

**Neither vulnerability is our discovery.** Both are OpenZeppelin's audit
findings, and both were fixed upstream in July 2026:

| Primitive | Audit finding | Fixed by | Merged |
|---|---|---|---|
| `ecdh` | [L-03 — bind the ECDH shared-secret sign bit][l03] | [#778][pr778] | 17 Jul 2026 |
| `encrypt_auditor_sender_balance` | [N-07 — withdraw checkpoint pad collides with the transfer amount pad][n07] | [#792][pr792] | 16 Jul 2026 |

The vulnerabilities are theirs to describe, and they describe them precisely.
L-03: an x-only ECDH secret is invariant under point negation, and `−PVK =
(−vk)·H` is itself a valid registration, so the key→secret map is two-to-one.
N-07: the first sponge squeeze is the **amount** pad, so reusing it for the
checkpoint lets anyone who knows a transfer amount recover the pad and decrypt a
later withdraw's checkpoint, under `(r_e, σ)` reuse.

What this project adds is the other half of the picture — what happened after
the fixes landed:

> **The verifier deployed on testnet still behaves the pre-fix way.** A client
> implementing L-03 and N-07 as specified produces proofs that deployment will
> not accept. The fixtures moved on 16–17 July; the deployment did not follow.
> Anyone building against those contracts today is building on pre-fix
> cryptography, and nothing in the published material says so.

Reproduce both — fixtures fetched live from OpenZeppelin, run against the real
compiled circuits:

```bash
node examples/drift.mjs
```

Each divergence is [pinned from both sides](./packages/conformance/src/divergences.js):
the suite fails if our value drifts, if the spec moves again, **or if the two
converge** — the last meaning the circuits were regenerated and the divergence
should be deleted rather than left standing as a stale excuse.

### 3 · `δ_ecdh` and `DISCLOSURE` both claim domain tag 13

`δ_ecdh` is `13` — [#778][pr778] assigns it, and the `ecdh` fixture
independently confirms it, since no other tag reproduces the vector. This
codebase already assigns 13 to `DISCLOSURE`, so the two collide.

### 4 · The bug the condominium found

Blindings were accumulated modulo `r` when the chain accumulates commitment
**points**, whose scalars reduce modulo the group order `p`. Since `r < p`, a
sum that crosses `r` came out short by exactly `r·H`, and the wallet
reconstructed an opening its own on-chain commitment rejects.

One payment reconstructs perfectly under either modulus, which is why nothing
caught it: every example shipped so far moved value with a single transfer. Two
random blindings cross `r` about half the time, so the building's eight
payments wrapped six times out of seven and the audit came out red against a
chain that was perfectly correct.

Fixed in `0.1.1`. The regression test
([`packages/sdk/src/state/accumulation.test.ts`](./packages/sdk/src/state/accumulation.test.ts))
carries its own falsifiability guard:

```
it("at least one partial sum actually wrapped — otherwise this proves nothing")
it("one payment reconstructs exactly — which is why this hid for so long")
it("the disagreement moves the commitment by r·H — not by nothing")
```

Without the first, the case passes under the old implementation too. It is a
test that tests whether the test would fail.

### 5 · The §6.3 vectors the spec asks for and nobody published

`SDK.md` §6.3 names three derivations needing fixture coverage. One exists
upstream. The other two are [generated here](./packages/conformance/vectors/) in
OpenZeppelin's own testdata format:

- **`δ_eph`** — the spec's reason for wanting it: *"No circuit constrains `r_e`,
  so a fixture is the only mechanism keeping a user's clients in agreement."* A
  client that derives it differently still produces proofs that verify; the
  damage shows up later, when the user's second device cannot recompute it.
- **the §5.1 chain** — a fixed root through `addr_f` and `acct_f` to `sk`, `vk`,
  `Y`, `PVK`, including the SEP-0053 preimage and signature.

---

## How the conformance claim is kept honest

The fixtures in [`packages/conformance/fixtures/`](./packages/conformance/fixtures/)
are OpenZeppelin's, vendored verbatim so the suite runs offline and so the
expected values are theirs rather than ours (see [NOTICE](./NOTICE)).

Vendoring a copy of someone else's spec creates a way to be quietly wrong: the
copy becomes a fork and the suite starts asserting history.
[`check-fixtures-upstream.mjs`](./packages/conformance/scripts/check-fixtures-upstream.mjs)
re-fetches all 17 from their repository and byte-compares them — on every push
**and every Monday at 06:00 UTC**, so a change on their side surfaces here even
when nothing on ours has moved. As the CI comment puts it: *a conformance claim
that is only re-checked when we happen to commit is a claim about the past.*
A fixture it cannot fetch fails the run rather than being skipped.

[l03]: https://github.com/OpenZeppelin/stellar-contracts/issues/771
[pr778]: https://github.com/OpenZeppelin/stellar-contracts/pull/778
[n07]: https://github.com/OpenZeppelin/stellar-contracts/issues/785
[pr792]: https://github.com/OpenZeppelin/stellar-contracts/pull/792
