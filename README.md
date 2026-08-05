# stellar-confidential-token-sdk

[![CI](https://github.com/aguilar1x/stellar-confidential-token-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/aguilar1x/stellar-confidential-token-sdk/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/stellar-confidential-token-sdk)](https://www.npmjs.com/package/stellar-confidential-token-sdk)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)

**The layer underneath every confidential-token wallet: the archive a wallet
replays its history from, and the client that proves that archive is not lying.**

Every CT wallet has to rebuild its openings from an archive it did not write.
This is the only conformant one, plus the verifier that demonstrates it.

A confidential-token wallet has an unusual problem. The chain stores
*commitments*; only the wallet holds the *openings* that can spend them. So the
wallet is load-bearing in a way most wallets are not — an opening that is lost,
or derived slightly differently on a second device, is money that cannot be
moved.

Recovering that state after the RPC's seven-day window means replaying history
from an archive. OpenZeppelin's audit flagged that the specification for such an
archive did not exist ([N-08, issue #787][issue]: recovery was normative while
`INDEXER.md` was still "to be added", so implementations could diverge with
nothing to implement against). July 2026 filled both gaps —
[`SDK.md`][sdk] for the client's obligations and [`INDEXER.md`][indexer] for what
an archive must serve and how a client must verify it.

This repository implements both.

[sdk]: https://github.com/OpenZeppelin/stellar-contracts/blob/main/packages/tokens/src/confidential/docs/SDK.md
[indexer]: https://github.com/OpenZeppelin/stellar-contracts/blob/main/packages/tokens/src/confidential/docs/INDEXER.md
[issue]: https://github.com/OpenZeppelin/stellar-contracts/issues/787

## See it work

**→ [stellar-confidential-token-sdk-web.vercel.app](https://stellar-confidential-token-sdk-web.vercel.app)**

Two pages, nothing to install:

- **[A building collecting its dues](https://stellar-confidential-token-sdk-web.vercel.app/condominium)** —
  eight units pay different amounts, none of them on-chain, and every resident
  can still audit the total. Pedersen commitments add, so the chain ends up
  holding a commitment to the sum without ever holding one to any single
  payment. A normal ledger makes you pick between an auditable total and private
  line items; this does not.
- **[Don't trust your indexer](https://stellar-confidential-token-sdk-web.vercel.app)** —
  that guarantee only holds if the history the wallet replays is the real one.
  Five archives serve one account's history; three of them lie. The same client
  reads all five.

Or run it yourself. A real confidential payment on testnet, from a single signer — two fresh
accounts, secrets derived and never stored, a hidden amount, and the recipient
decrypting it from public chain events alone:

```bash
npm install
node examples/live-payment.mjs
```

Then break the archive it depends on, and watch the client refuse it:

```bash
ALICE_SECRET=<printed by the previous command> node examples/sabotage.mjs
```

```
ACCEPTED  honest      a faithful archive
          §7: openings match the chain

REJECTED  lagging     honest, but cannot vouch for the range
          C3: archive admitted an incomplete history

REJECTED  omitting    drops your merge, still claims complete: true
          §7: commitment mismatch on receiving
          it would have told you: receiving 1000000000     ← 100 XLM that do not exist

REJECTED  corrupting  alters your balance ciphertext, still claims complete: true
          §7: commitment mismatch on spendable
          it would have told you: spendable 600000001      ← wrong by a single stroop
```

Three adversaries, caught by two different defences, and the split is the whole
argument. The lagging archive is caught by `INDEXER.md` C3 — it admits the gap
itself. The other two **lie**, claiming `complete: true`, so C3 cannot help: a
completeness flag is only as good as the party asserting it. They are caught
because the client re-derives its openings and checks them against the chain's
commitments (§7).

That is what it means for an indexer to be untrusted rather than merely
monitored. And note the last line: wrong by one stroop, and still caught.

### Two endpoints, two operators

§7 asks deployments to run "at least two" independent archives, because two
instances on one provider share an outage — which is the failure the
requirement exists to prevent. So there are two, on different providers, and the
demo page checks both the same way:

```bash
curl https://confidential-token-archive.aaguilar1x.workers.dev/v1/health
# {"latest_ledger":…,"ingested_through":…,"ingested_from":3976100,"lag_seconds":0}
```

It answers C1 through C4, and correctly refuses a range below its ingestion
floor — verified with the published client, not with curl alone.

## What's here

| | |
|---|---|
| `packages/sdk` | The client. Key derivation, witness building, UltraHonk proving, offline state, selective disclosure. Published to npm. |
| `packages/conformance` | The `SDK.md` §6 suite: OpenZeppelin's fixtures byte-for-byte, circuit-execution parity with tamper cases, and the §6.3 vectors. |
| `apps/indexer` | An `INDEXER.md` archive (C1–C4) as a Web-standard `fetch` handler, so one implementation serves from Node, Cloudflare, Deno or Vercel. [Live](https://confidential-token-archive.aaguilar1x.workers.dev/v1/health). |
| `apps/web` | The demo page. [Live on Vercel](https://stellar-confidential-token-sdk-web.vercel.app). |
| `examples/` | The live payment and the sabotage, both against real testnet contracts. |

## Check it yourself in one command

No clone, no build, nothing to trust. This installs the published package from
the npm registry into a throwaway directory, fetches OpenZeppelin's fixtures from
**their** repository and reproduces them byte-for-byte, derives a key through
§5.1, generates a real UltraHonk proof against the circuits inside the tarball,
and shows a one-stroop tamper being refused:

```bash
curl -fsSL https://raw.githubusercontent.com/aguilar1x/stellar-confidential-token-sdk/master/scripts/verify-published.mjs | node --input-type=module
```

```
installed stellar-confidential-token-sdk@0.1.1

1 · OpenZeppelin's published fixtures, byte-for-byte
    15 reproduced exactly
    ecdh DIVERGES — deployed circuits use x-only; spec absorbs both coordinates
    encrypt_auditor_sender_balance DIVERGES — deployed circuits use the first sponge squeeze; spec the second
2 · §5.1 derivation    same signer, same key, twice
3 · UltraHonk proof    15308 XDR bytes in 1.5s
4 · one-stroop tamper  rejected: commitment differs, so the opening cannot verify
```

It prints the two divergences rather than hiding them, and **fails** if a third
appears. It is the same script CI runs on every push, which is what the badge
above asserts.

## For wallet integrators

Every confidential-token wallet — including any built at this hackathon — has to
rebuild openings from an archive it did not write. That is the layer this sits
at. The whole surface a wallet consumes:

```ts
import { deriveSk, deriveKeys, StateEngine, pointToBytes } from "stellar-confidential-token-sdk";
import { proveTransfer } from "stellar-confidential-token-sdk/node";
import { ChainClient, IndexerV1Client, hybridFetchEvents } from "stellar-confidential-token-sdk/chain";

const { sk, addrF } = deriveSk(root, CONTRACT, ACCOUNT);   // §5.1, nothing stored
const keys = deriveKeys(sk, addrF);

const engine = new StateEngine({ address: ACCOUNT, keys });
engine.ingestEvents(await eventsFrom(archive));            // C2/C3 honoured
engine.verifyAgainstChain({ spendableC, receivingC });     // §7 — never skip this

const { payload, next } = await proveTransfer({ keys, ...engine.spendable(), amount });
```

The conformance suite is a public tool, not a private badge: point it at **any**
CT indexer and it will tell you whether that indexer serves what `INDEXER.md`
requires. We ran it against every one we could find.

## Conformance, honestly

15 of the 17 published primitives reproduce **byte-for-byte**. Two do not, and
what they reveal is worth more than a clean sweep would have been:

| Primitive | Specification | This client |
|---|---|---|
| `ecdh` | `Poseidon2(δ_ecdh, S.x, S.y)` | `(s·P).x` |
| `encrypt_auditor_sender_balance` | second sponge squeeze | first squeeze |

Both were tested against the real circuits. The vendored withdraw circuit
**accepts** the first-squeeze form, and the live transfer against the deployed
contract works with x-only ECDH. So the finding is not about this client:

> **The contracts deployed on testnet were compiled from circuits that predate
> the published specification — and both changes the spec made are security
> fixes.** Anyone building against those contracts today is building on
> pre-fix cryptography, with nothing to tell them.

The spec states both reasons outright. An x-only ECDH secret is invariant under
point negation, so `P` and `−P` derive the *same* secret. And the first sponge
squeeze is the **amount** pad, left unused on purpose "so the checkpoint pad
never coincides with an amount pad, even under `(r_e, σ)` reuse" — using it
reintroduces exactly that pad collision.

Each divergence is [pinned from both sides](./packages/conformance/src/divergences.js):
the suite fails if our value drifts, if the spec moves again, **or if the two
converge** — the last meaning the circuits were regenerated and the divergence
should be deleted rather than left standing as a stale excuse.

There is also a domain-tag collision: `δ_ecdh` was recovered from the fixtures
(only domain 13 reproduces the `ecdh` vector) and this codebase already assigns
13 to `DISCLOSURE`.

### The bug the condominium found

Blindings were accumulated modulo `r` when the chain accumulates commitment
**points**, whose scalars reduce modulo the group order `p`. Since `r < p`, a
sum that crosses `r` came out short by exactly `r·H`, and the wallet
reconstructed an opening its own on-chain commitment rejects.

One payment reconstructs perfectly under either modulus, which is why nothing
caught it: every example shipped so far moved value with a single transfer. Two
random blindings cross `r` about half the time, so the building's eight
payments wrapped six times out of seven and the audit came out red against a
chain that was perfectly correct.

Fixed in `0.1.1`, with a regression test that asserts a partial sum actually
wrapped — without that guard the case passes under the old implementation too.

### The vectors §6.3 asks for and nobody published

`SDK.md` §6.3 names three derivations needing fixture coverage. One exists
upstream. The other two are [generated here](./packages/conformance/vectors/) in
OpenZeppelin's own testdata format:

- **`δ_eph`** — the spec's reason for wanting it: *"No circuit constrains `r_e`,
  so a fixture is the only mechanism keeping a user's clients in agreement."* A
  client that derives it differently still produces proofs that verify; the
  damage shows up later, when the user's second device cannot recompute it.
- **the §5.1 chain** — a fixed root through `addr_f` and `acct_f` to `sk`, `vk`,
  `Y`, `PVK`, including the SEP-0053 preimage and signature.

## Using it

```bash
npm install stellar-confidential-token-sdk
```

```ts
import { deriveSk, deriveKeys, skSigningMessage } from "stellar-confidential-token-sdk";
import { proveTransfer } from "stellar-confidential-token-sdk/node";

// The account secret is DERIVED, never stored — same signer, same key, forever.
const root = await wallet.signMessage(skSigningMessage(CONTRACT, ACCOUNT));
const { sk, addrF } = deriveSk(root, CONTRACT, ACCOUNT);

const { payload, next } = await proveTransfer({
  keys: deriveKeys(sk, addrF),
  v: 2500n, r: openingBlinding,
  amount: 750n,
  pvkB: recipientViewingKey, kAudR: auditorKey, kAudS: auditorKey,
});
// PERSIST `next` BEFORE SUBMITTING. It is the only thing that can spend the result.
```

Browser proving works too, via bb.js in WASM. It needs cross-origin isolation
(`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy:
credentialless`) for `SharedArrayBuffer`.

## Known limitations

Stated plainly, because a conformance project that hid its own gaps would be
self-refuting:

- **Testnet only.** The two divergences above are unresolved until the circuits
  are regenerated and the verifier redeployed. Do not hold value with this.
- **Deposits and withdrawals are public by design.** Only transfers hide amounts.
- **The two divergences are not fixable from the client side** without breaking
  compatibility with the deployed verifier.
- **The disclosure receipt is a bearer token** — anyone holding the URL can read
  the disclosed amount.
- **Not audited.** Nethermind's audit covers the contracts, not this client.
- **`npm audit` reports advisories in the demo site's build tooling.** They are
  reachable only through paths this project does not use: the PostCSS ones need
  attacker-controlled CSS, and ours is hand-written; `sharp` arrives through
  `next/image`, which appears nowhere here. Closing them means a major Next
  version bump, which is a larger risk to a working demo than the advisories
  are. The published SDK itself carries no known advisories — `npm audit` on a
  clean install of it is empty.

## Provenance and license

Apache-2.0. The crypto core was written by the same author inside an earlier
project and re-published here; every extracted file was verified per-file
against that repository's git history to contain no other contributor's work.
See [NOTICE](./NOTICE).

An independent implementation. Not endorsed by or affiliated with OpenZeppelin.
