/**
 * Docs content, as data.
 *
 * Kept out of the page so the section list, the sidebar and the anchor targets
 * cannot drift from each other. A docs page whose table of contents disagrees
 * with its headings is worse than one with no table of contents.
 */

export interface Section {
  id: string;
  title: string;
  /** One line under the heading. Says what the section is for, not what it covers. */
  lede?: string;
  blocks: Block[];
}

export type Block =
  | { kind: "p"; text: string }
  | { kind: "code"; lang: string; code: string }
  | { kind: "note"; tone: "warn" | "info"; title: string; text: string }
  | { kind: "table"; head: string[]; rows: string[][] };

export const SECTIONS: Section[] = [
  {
    id: "install",
    title: "Install",
    lede: "Node 20 or newer. Proving works in the browser too, with one header requirement.",
    blocks: [
      { kind: "code", lang: "bash", code: "npm install stellar-confidential-token-sdk" },
      {
        kind: "table",
        head: ["Import", "What it holds"],
        rows: [
          [
            "stellar-confidential-token-sdk",
            "Browser-safe: crypto, key derivation, witnesses, the prover, the state engine, disclosure.",
          ],
          [
            "stellar-confidential-token-sdk/node",
            "Circuit and verifying-key loading from disk, the prove* operations, JsonFileStore.",
          ],
          [
            "stellar-confidential-token-sdk/chain",
            "Soroban reader, event decoding, the INDEXER.md client, auditor decryption.",
          ],
        ],
      },
      {
        kind: "note",
        tone: "info",
        title: "The top-level entry imports no node: module",
        text: "Not directly and not transitively. It is the surface a browser bundle consumes, which is why circuit loading lives on a separate subpath.",
      },
    ],
  },

  {
    id: "derive",
    title: "Derive the account secret",
    lede: "The single most important thing this SDK does differently.",
    blocks: [
      {
        kind: "p",
        text: "A confidential account is controlled by a secret scalar. Draw it randomly and store it, and a clean device can never rebuild the account. SDK.md §5.1 requires deriving it from a signer root instead, so the same signer reproduces the same key anywhere, forever.",
      },
      {
        kind: "code",
        lang: "ts",
        code: `import { deriveSk, deriveKeys, skSigningMessage } from "stellar-confidential-token-sdk";

// The wallet signs a message naming the protocol, the deployment and the
// account. That signature IS the root; nothing is persisted.
const message = skSigningMessage(CONTRACT_ID, ACCOUNT);
const root = await wallet.signMessage(message);

const { sk, vk, addrF, j } = deriveSk(root, CONTRACT_ID, ACCOUNT);
const keys = deriveKeys(sk, addrF);`,
      },
      {
        kind: "note",
        tone: "warn",
        title: "j is an output, not an input",
        text: "It counts rejections during sampling. A client that samples candidates differently lands on a different j, and therefore a different sk, from the same root. That is why §4.7 clears exactly two bits, and why this SDK pins it with a test.",
      },
    ],
  },

  {
    id: "state",
    title: "Rebuild state from the chain",
    lede: "The chain holds commitments. Your openings are yours to reconstruct.",
    blocks: [
      {
        kind: "p",
        text: "The state engine replays confidential-token events and recovers the openings behind your balances. It performs no network I/O itself: you fetch the events and hand them over, which is what lets the same engine run against an RPC, an archive, or both.",
      },
      {
        kind: "code",
        lang: "ts",
        code: `import { StateEngine, pointToBytes } from "stellar-confidential-token-sdk";
import { ChainClient, hybridFetchEvents } from "stellar-confidential-token-sdk/chain";

const engine = new StateEngine({ address: ACCOUNT, keys });
const { events } = await hybridFetchEvents(client, indexer, { fromLedger });
engine.ingestEvents(events.filter(mine));

// Then always: check what you rebuilt against what the chain holds.
const onchain = await client.confidentialBalance(ACCOUNT);
const check = engine.verifyAgainstChain({
  spendableC: pointToBytes(onchain.spendableBalance),
  receivingC: pointToBytes(onchain.receivingBalance),
});
if (!check.ok) throw new Error("reconstructed state does not match the chain");`,
      },
      {
        kind: "note",
        tone: "warn",
        title: "Never skip verifyAgainstChain",
        text: "It is the check that makes an archive untrusted rather than merely monitored. An archive that drops one event still returns a plausible balance; only the commitment comparison catches it.",
      },
    ],
  },

  {
    id: "transfer",
    title: "Send a confidential transfer",
    lede: "Prove, submit, and persist the opening the proof produced.",
    blocks: [
      {
        kind: "code",
        lang: "ts",
        code: `import { proveTransfer } from "stellar-confidential-token-sdk/node";

const spendable = engine.spendable();

const { payload, proof, next } = await proveTransfer({
  keys,
  v: spendable.v,
  r: spendable.r,
  amount: 750_0000000n,
  pvkB: recipientViewingKey,
  kAudR: auditorKey,
  kAudS: auditorKey,
});

await persist(next);   // BEFORE submitting. See below.
await client.invoke(CONTRACT_ID, "confidential_transfer",
  [addr(from), addr(to), bytes(payload)], signer);`,
      },
      {
        kind: "note",
        tone: "warn",
        title: "Persist `next` before you submit",
        text: "The opening it contains is the only thing that can ever spend the resulting balance. Submit first and crash before persisting, and the transfer succeeds on-chain while the funds become unspendable.",
      },
    ],
  },

  {
    id: "archive",
    title: "Read from an archive",
    lede: "INDEXER.md capabilities C1 through C4, and why C3 is the one that matters.",
    blocks: [
      {
        kind: "p",
        text: "Soroban's RPC keeps roughly seven days of events. Anything older comes from an archive, which the specification is explicit about not trusting for integrity, only for availability and completeness.",
      },
      {
        kind: "code",
        lang: "ts",
        code: `import { IndexerV1Client, IncompleteHistoryError }
  from "stellar-confidential-token-sdk/chain";

const archive = new IndexerV1Client({ baseUrl: ARCHIVE_URL, label: "primary" });

// Ask what it covers before asking for history.
const status = await archive.health();

try {
  const { events } = await archive.fetchEvents({
    contractId: CONTRACT_ID,
    account: ACCOUNT,
    fromLedger: status.ingestedFrom,
    toLedger: status.ingestedThrough,
  });
} catch (e) {
  if (e instanceof IncompleteHistoryError) {
    // The archive said it cannot vouch for the range. Try a second endpoint.
  }
}`,
      },
      {
        kind: "table",
        head: ["Capability", "Required", "What it answers"],
        rows: [
          ["C1 checkpoint", "Recommended", "The latest checkpoint at or before a ledger."],
          ["C2 ordered history", "Required", "Events for an account, in total order, paginated."],
          ["C3 completeness", "Required", "Whether the served range is gap-free."],
          ["C4 ingestion status", "Required", "How stale the archive is."],
        ],
      },
      {
        kind: "note",
        tone: "warn",
        title: "A missing completeness flag counts as not complete",
        text: "C3 is required, so silence from an archive means it is non-conformant, and the only reading of silence that cannot cause a wrong balance to be trusted is the pessimistic one. fetchEvents refuses an incomplete range by default rather than returning a partial replay.",
      },
    ],
  },

  {
    id: "browser",
    title: "Proving in a browser",
    lede: "One header pair, and one thing to know about bundlers.",
    blocks: [
      {
        kind: "p",
        text: "Proofs are generated by bb.js compiled to WASM, which wants threads, which wants SharedArrayBuffer, which wants cross-origin isolation. Verification needs none of it, being plain field arithmetic, so a page that only checks balances can skip the headers entirely.",
      },
      {
        kind: "code",
        lang: "ts",
        code: `// next.config.ts
async headers() {
  return [{
    source: "/(.*)",
    headers: [
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
    ],
  }];
}`,
      },
      {
        kind: "note",
        tone: "info",
        title: "Why credentialless rather than require-corp",
        text: "It keeps the page cross-origin isolated while still letting fetch reach a Soroban RPC that sends no CORP headers of its own.",
      },
    ],
  },

  {
    id: "conformance",
    title: "Conformance",
    lede: "What is verified, and what is knowingly not.",
    blocks: [
      {
        kind: "p",
        text: "The suite loads OpenZeppelin's published fixtures at runtime rather than hardcoding them, so a vector added upstream becomes a test case with no code change and a fixture that goes missing fails instead of quietly shrinking the suite. All 17 primitives reproduce byte-for-byte.",
      },
      {
        kind: "p",
        text: "All 17 converge because the two that once diverged were fixed here, not excused: an ephemeral scalar derived under the wrong domain tag, and an auditor ciphertext built with the wrong sponge. The divergence table is still in the suite, empty and armed. If a value drifts on either side, the suite names which one moved instead of quietly passing.",
      },
      { kind: "code", lang: "bash", code: "npm run conformance" },
    ],
  },
];
