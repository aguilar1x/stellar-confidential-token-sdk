> **This directory is OpenZeppelin's, vendored verbatim.**
>
> Copied unmodified from
> [`packages/tokens/src/confidential/circuits/lib/`](https://github.com/OpenZeppelin/stellar-contracts/tree/98090b3e59785454f55b3617992c2f84250c7173/packages/tokens/src/confidential/circuits/lib)
> in `OpenZeppelin/stellar-contracts`, at commit `98090b3` — the same commit the
> deployed verifier's circuits were built from. Copyright OpenZeppelin,
> Apache-2.0 — not covered by this repository's copyright.
>
> It is vendored rather than fetched because Nargo can pin a git dependency only
> to a branch or tag name, never to a commit. A branch pin would let this
> project's circuits change meaning without a single line of it changing, which
> is the opposite of what the rest of this repository argues for.
>
> `scripts/check-lib-upstream.mjs` re-fetches `src/lib.nr` from that exact commit
> and byte-compares it on every push, so the copy cannot quietly become a fork.
