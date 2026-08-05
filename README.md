# stellar-confidential-sdk

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
| Crypto core (Grumpkin, Poseidon2, commitments, field ops) | Implemented, 92 tests passing |
| Witness builders (register, transfer, withdraw, disclose) | Implemented |
| UltraHonk proving via bb.js, keccak transcript | Implemented, self-verifying against real circuits |
| Offline state engine + `verifyAgainstChain` | Implemented |
| Selective disclosure (sender + recipient) | Implemented |
| §5.1 key derivation (HKDF-SHA-512 → rejection sampling) | **Not yet conformant** — see below |
| §6 conformance suite (fixtures, parity, tamper, vectors) | Not started |
| Indexer (INDEXER.md C2/C3/C4) + `recoverFromSeed` | Not started |

### Known gap: §5.1

The crypto core carried over from its origin project derives the account secret
`sk` **randomly** and seals it in a server-held envelope. SDK.md §5.1 instead
requires a deterministic derivation:

```
sk = RS(HKDF-SHA-512(
  IKM  = root,
  salt = "openzeppelin/confidential-token/v1/sk",
  info = be_32(addr_f) || be_32(acct_f) || le_4(j)))
```

Everything downstream of `sk` already matches the spec — `address_to_field`
(§4.9), `vk = poseidon_with_domain(δ_vk, [sk, addr_f])`, and `Y = sk·H` are
implemented and tested. Replacing the derivation itself is the next commit, and
it is a prerequisite for seed-based recovery.

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
