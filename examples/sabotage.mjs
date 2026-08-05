/**
 * Break the indexer. Watch the client refuse it.
 *
 * The same account, the same chain, four different archives. One is honest;
 * three are not, in three different ways. The client is unchanged throughout —
 * every rejection comes from a check it performs by default.
 *
 * Run:  node examples/sabotage.mjs
 *
 * Requires an account that has already transacted; pass ALICE_SECRET, or let
 * the script run examples/live-payment.mjs first to create one.
 */

import { Keypair, Networks, rpc } from "@stellar/stellar-sdk";

import {
  deriveSk,
  deriveKeys,
  skSigningMessage,
  pointToBytes,
  StateEngine,
} from "stellar-confidential-token-sdk";
import {
  ChainClient,
  IndexerV1Client,
  IncompleteHistoryError,
} from "stellar-confidential-token-sdk/chain";

import { MemoryStore } from "../apps/indexer/src/store.js";
import { createHandler } from "../apps/indexer/src/handler.js";
import { ingestFromRpc } from "../apps/indexer/src/ingest.js";
import { dishonestStore } from "../apps/indexer/src/tamper.js";

const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK = Networks.TESTNET;
const CONTRACTS = {
  token: "CAPLH4ZW7EDSYRBCQN77Y4K7W5RNA6TO76JQ5CGHHIPY4ALWVQZ2WFAY",
  verifier: "CC6NG5LWW6QA4YSW2RP7RR2CE5FF6IHAGJEYY4STG6QP563EWSZU5DG7",
  auditor: "CAEYYDRJPJ73UR3UZWYLSIWW4CHUZILTSENAWOUYXGSR4LPY4HQ23R4L",
};

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const OFF = "\x1b[0m";

/** Serve a store over the client's fetch, without opening a socket. */
function archive(store, label) {
  const handler = createHandler({ store });
  const client = new IndexerV1Client({ baseUrl: `https://${label}.archive`, label });
  const origFetch = globalThis.fetch;
  return {
    client,
    async withFetch(fn) {
      globalThis.fetch = (input) => handler(new Request(String(input)));
      try {
        return await fn();
      } finally {
        globalThis.fetch = origFetch;
      }
    },
  };
}

function eventsFor(address, events) {
  return events.filter((ev) =>
    ev.type === "register" || ev.type === "merge"
      ? ev.account === address
      : ev.from === address || ev.to === address,
  );
}

/**
 * Rebuild this account's balance from one archive and check it against the
 * chain. Returns what the client concluded, and why.
 */
async function trustButVerify({ label, store, chain, address, keys, onchain, fromLedger }) {
  const { client, withFetch } = archive(store, label);

  let events;
  try {
    const res = await withFetch(() =>
      client.fetchEvents({
        contractId: CONTRACTS.token,
        account: address,
        fromLedger,
      }),
    );
    events = res.events;
  } catch (e) {
    if (e instanceof IncompleteHistoryError) {
      return { ok: false, stage: "C3", detail: "archive admitted an incomplete history" };
    }
    throw e;
  }

  const engine = new StateEngine({ address, keys });
  engine.ingestEvents(eventsFor(address, events));

  const check = engine.verifyAgainstChain({
    spendableC: pointToBytes(onchain.spendableBalance),
    receivingC: pointToBytes(onchain.receivingBalance),
  });

  if (!check.ok) {
    const which = [
      check.spendableOk ? null : "spendable",
      check.receivingOk ? null : "receiving",
    ]
      .filter(Boolean)
      .join(" + ");
    return {
      ok: false,
      stage: "§7",
      detail: `commitment mismatch on ${which}`,
      state: engine.state(),
    };
  }
  return { ok: true, stage: "§7", detail: "openings match the chain", state: engine.state() };
}

async function main() {
  const secret = process.env.ALICE_SECRET;
  if (!secret) {
    console.error(
      "Set ALICE_SECRET to an account that has already made a confidential transfer.\n" +
        "Run `node examples/live-payment.mjs` first — it prints the accounts it creates.",
    );
    process.exit(1);
  }

  const kp = Keypair.fromSecret(secret);
  const address = kp.publicKey();

  const chain = new ChainClient({
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK,
    contracts: CONTRACTS,
  });
  const server = new rpc.Server(RPC_URL);

  console.log(`\n${BOLD}Account${OFF} ${address}`);
  console.log(`${DIM}Its balance is a commitment on-chain. Only the openings are ours.${OFF}`);

  const onchain = await chain.confidentialBalance(address);
  if (!onchain) {
    console.error("This account is not registered on the confidential token.");
    process.exit(1);
  }

  // One honest ingestion, shared by every archive below. The adversaries differ
  // only in how they SERVE it, so nothing is stacked in the client's favour.
  console.log(`\n${DIM}Ingesting the real chain history…${OFF}`);
  const honest = new MemoryStore();
  const { from, to, ingested } = await ingestFromRpc({
    server,
    store: honest,
    contractId: CONTRACTS.token,
    fromLedger: 0,
  });
  console.log(`${DIM}  ${ingested} events over ledgers ${from}..${to}${OFF}`);

  const keys = (() => {
    const root = new Uint8Array(kp.signMessage(Buffer.from(skSigningMessage(CONTRACTS.token, address))));
    const { sk, addrF } = deriveSk(root, CONTRACTS.token, address);
    return deriveKeys(sk, addrF);
  })();

  const scenarios = [
    {
      label: "honest",
      store: honest,
      says: "a faithful archive",
    },
    {
      label: "lagging",
      store: dishonestStore(honest, { mode: "honest-gap" }),
      says: "honest, but cannot vouch for the range",
    },
    {
      label: "omitting",
      store: dishonestStore(honest, { mode: "omit", eventName: "merge" }),
      says: `drops your merge, still claims ${BOLD}complete: true${OFF}`,
    },
    {
      label: "corrupting",
      store: dishonestStore(honest, { mode: "corrupt", eventName: "transfer", field: "b_tilde" }),
      says: `alters your balance ciphertext, still claims ${BOLD}complete: true${OFF}`,
    },
  ];

  console.log(`\n${BOLD}Four archives. Same chain. Same client.${OFF}\n`);

  const results = [];
  for (const s of scenarios) {
    const r = await trustButVerify({
      label: s.label,
      store: s.store,
      chain,
      address,
      keys,
      onchain,
      fromLedger: from,
    });
    results.push({ ...s, ...r });

    const mark = r.ok ? `${GREEN}ACCEPTED${OFF}` : `${RED}REJECTED${OFF}`;
    console.log(`  ${mark}  ${BOLD}${s.label.padEnd(11)}${OFF} ${DIM}${s.says}${OFF}`);
    console.log(`            ${DIM}caught by ${r.stage}: ${r.detail}${OFF}`);
    if (r.state) {
      console.log(
        `            ${DIM}it would have told you: spendable ${r.state.spendable.v}, receiving ${r.state.receiving.v}${OFF}`,
      );
    }
    console.log();
  }

  const accepted = results.filter((r) => r.ok).map((r) => r.label);
  const rejected = results.filter((r) => !r.ok);

  console.log(`${BOLD}Accepted:${OFF} ${accepted.join(", ") || "none"}`);
  console.log(
    `${BOLD}Rejected:${OFF} ${rejected.map((r) => `${r.label} (${r.stage})`).join(", ")}\n`,
  );

  console.log(
    `${DIM}The lagging archive was caught by INDEXER.md C3 — it said so itself.\n` +
      `The other two LIED about completeness, so C3 could not help. They were caught\n` +
      `because the client re-derived its openings and checked them against the chain's\n` +
      `commitments (§7). That check is why the indexer never has to be trusted.${OFF}\n`,
  );

  if (accepted.length !== 1 || accepted[0] !== "honest" || rejected.length !== 3) {
    console.error(`${RED}Unexpected outcome — the demo did not behave as specified.${OFF}`);
    process.exit(1);
  }
  console.log(`${GREEN}✓ Only the honest archive was believed.${OFF}\n`);
}

main().catch((e) => {
  console.error(`\n${RED}${e?.message ?? e}${OFF}`);
  process.exit(1);
});
