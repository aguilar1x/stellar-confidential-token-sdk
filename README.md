# stellar-confidential-token-sdk

**A conformant client layer for OpenZeppelin Confidential Tokens on Stellar.**

In July 2026 OpenZeppelin published two normative specifications for confidential
tokens — [`SDK.md`][sdk] (the client's obligations) and [`INDEXER.md`][indexer]
(what an indexer must serve and how a client must verify it). Both exist because
an external audit finding (N-08, [issue #787][issue]) established that the client
is load-bearing: lose an opening and the funds are unrecoverable.

This repository is an implementation of those obligations.

[sdk]: https://github.com/OpenZeppelin/stellar-contracts/blob/main/packages/tokens/src/confidential/docs/SDK.md
[indexer]: https://github.com/OpenZeppelin/stellar-contracts/blob/main/packages/tokens/src/confidential/docs/INDEXER.md
[issue]: https://github.com/OpenZeppelin/stellar-contracts/issues/787

## Status

This is early, in-progress work. What is true right now:

| Component | State |
|---|---|
| Crypto core (Grumpkin, Poseidon2, commitments, field ops) | Implemented, tested |
| §4.7 rejection sampling | Implemented, tested |
| §5.1 deterministic key derivation | Implemented, tested |
| Witness builders (register, transfer, withdraw, disclose) | Implemented |
| UltraHonk proving via bb.js, keccak transcript | Implemented, self-verifying against real circuits |
| Offline state engine + `verifyAgainstChain` | Implemented |
| Selective disclosure (sender + recipient) | Implemented |
| §6 conformance suite (fixtures, parity, tamper, vectors) | Not started |
| Indexer (INDEXER.md C2/C3/C4) + `recoverFromSeed` | Not started |

117 tests pass, including real UltraHonk proofs generated and verified against
the vendored circuits.

### §5.1 — deterministic derivation

Recoverability is the property the whole client hinges on, and it exists only if
derivation is deterministic. This SDK implements the spec's chain exactly:

```
msg  = "openzeppelin/confidential-token/v1/sk" || 0x0a
       || enc(contract) || 0x0a || enc(account)
root = Ed25519-Sign(sk_ed, SHA-256("Stellar Signed Message:\n" || msg))
sk   = RS(HKDF-SHA-512(
         IKM  = root,
         salt = "openzeppelin/confidential-token/v1/sk",
         info = be_32(addr_f) || be_32(acct_f) || le_4(j)))
```

`j` starts at zero and increments on every rejection — both when §4.7 rejects
the candidate and when the induced `vk` would be zero.

Two details are easy to get silently wrong, so both are pinned by tests:

- **§4.7 clears the top 2 bits, not the top byte.** Clearing 8 bits makes
  rejection impossible and yields a secret uniform over `[1, 2^248)` rather than
  `[1, r)`. Because `j` advances on rejection, a wrong mask also produces a
  different `sk` for the same root — an interoperability break, not just a
  statistical one.
- **SEP-0053 signs `SHA-256(prefix || msg)`, not the message.** Our construction
  is cross-checked against `@stellar/stellar-sdk`'s independent `signMessage`.

## Layout

```
packages/sdk/          the client SDK (published to npm)
packages/conformance/  SDK.md §6 conformance suite (fixtures, parity, tamper)
apps/                  reference app + indexer
```

## Development

```bash
npm install
npm run build
npm test
```

Requires Node ≥ 20.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE) for provenance.

This is an independent implementation. It is not endorsed by or affiliated with
OpenZeppelin.
