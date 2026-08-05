# stellar-confidential-token-sdk

**A conformant TypeScript client for OpenZeppelin Confidential Tokens on Stellar.**

In July 2026 OpenZeppelin published [`SDK.md`][sdk] — a specification of what a
confidential-token *client* must do, written as obligations rather than as an
API. The client is load-bearing in a way most are not: the chain stores
commitments, the client stores the openings, and an opening that is lost or
wrongly derived means funds that cannot be spent. OpenZeppelin's audit separately
flagged that the archive those openings are rebuilt from had no specification at
all (N-08, [issue #787][issue]) — `INDEXER.md` is the answer to that finding.

This package implements those obligations.

[sdk]: https://github.com/OpenZeppelin/stellar-contracts/blob/main/packages/tokens/src/confidential/docs/SDK.md
[issue]: https://github.com/OpenZeppelin/stellar-contracts/issues/787

```bash
npm install stellar-confidential-token-sdk
```

## A confidential transfer

```ts
import { deriveSk, deriveKeys, skSigningMessage } from "stellar-confidential-token-sdk";
import { proveTransfer } from "stellar-confidential-token-sdk/node";

// 1. The account secret is DERIVED, never stored — same seed, same key, forever.
const root = await wallet.signMessage(skSigningMessage(CONTRACT, ACCOUNT));
const { sk, addrF } = deriveSk(root, CONTRACT, ACCOUNT);

// 2. Prove a transfer of 750 units out of a spendable balance of 2500.
const { payload, proof, next } = await proveTransfer({
  keys: deriveKeys(sk, addrF),
  v: 2500n, r: openingBlinding,     // your current opening
  amount: 750n,
  pvkB: recipientViewingKey, kAudR: auditorKey, kAudS: auditorKey,
});

// 3. `payload` is the XDR the contract expects; `next` is your new opening.
//    PERSIST `next` BEFORE SUBMITTING — see "Openings are the asset" below.
```

Proving runs in the browser too, via bb.js compiled to WASM. It needs
cross-origin isolation (`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: credentialless`) for `SharedArrayBuffer`.

## Openings are the asset

The single most important thing this SDK asks of you: **the opening `(v, r)` for
a commitment is the only thing that can spend it.** The chain has the
commitment; nobody has your opening but you.

- Persist `next` from every operation *before* you submit the transaction.
- Never derive `sk` randomly. Derive it from a root with `deriveSk`, so a clean
  device with the right signer reproduces the same account.
- Verify your local state against the chain with `StateEngine.verifyAgainstChain`
  before trusting a balance you were handed by an indexer.

## What conformance means here

`SDK.md` §5.1 specifies key derivation as an exact chain, and this package
implements it verbatim:

```
msg  = "openzeppelin/confidential-token/v1/sk" || 0x0a
       || enc(contract) || 0x0a || enc(account)
root = Ed25519-Sign(sk_ed, SHA-256("Stellar Signed Message:\n" || msg))
sk   = RS(HKDF-SHA-512(
         IKM  = root,
         salt = "openzeppelin/confidential-token/v1/sk",
         info = be_32(addr_f) || be_32(acct_f) || le_4(j)))
```

Two details are easy to get silently wrong, and both are pinned by tests:

- **§4.7 clears the top 2 bits of the candidate, not the top byte.** Clearing 8
  bits makes rejection impossible and yields a secret uniform over `[1, 2^248)`
  rather than `[1, r)`. Since the counter `j` advances on each rejection, a wrong
  mask also derives a *different* `sk` from the same root — an interoperability
  break, not merely a statistical one.
- **SEP-0053 signs `SHA-256(prefix || msg)`, not the message.** Our construction
  is cross-checked byte-for-byte against `@stellar/stellar-sdk`'s own
  `signMessage`.

A §5.1-derived secret is exercised end-to-end against the **real compiled
circuits** — register and transfer proofs are generated and verified in the test
suite, so conformance is demonstrated rather than asserted.

## Entry points

| Import | Contents |
|---|---|
| `stellar-confidential-token-sdk` | Browser-safe: crypto, derivation, witnesses, prover, disclosure, state engine |
| `stellar-confidential-token-sdk/node` | Circuit/VK loading from disk, the `prove*` ops, `JsonFileStore` |
| `stellar-confidential-token-sdk/chain` | On-chain reader, event decoding, auditor decryption |

The top-level entry imports no `node:*` module, directly or transitively — it is
the surface a browser bundle consumes.

## Status

Early and in progress. Implemented and tested: the crypto core, §4.7 sampling,
§5.1 derivation, witness builders, UltraHonk proving with a keccak transcript,
the offline state engine, and selective disclosure. Not yet present: the §6
conformance suite, the INDEXER.md client, and seed-based recovery.

Testnet only. Do not use this to hold value you cannot lose.

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

An independent implementation, not endorsed by or affiliated with OpenZeppelin.
