/**
 * A real confidential payment on Stellar testnet, from one signer, end to end.
 *
 * This is the practical-adoption proof: two accounts are funded from scratch,
 * their confidential secrets are DERIVED per SDK.md §5.1 (nothing is stored, no
 * server holds an envelope), both register on the live contract, one deposits
 * public XLM, merges it into a spendable balance, and sends a confidential
 * transfer whose amount is hidden on-chain. The recipient then decrypts it.
 *
 * Run:  node examples/live-payment.mjs
 *
 * Every step prints the transaction hash so it can be opened on stellar.expert.
 */

import {
  Keypair,
  Networks,
  Address,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";

import {
  deriveSk,
  deriveKeys,
  skSigningMessage,
  pointToBytes,
  pointFromBytes,
  StateEngine,
  addressToField,
} from "stellar-confidential-token-sdk";
import { proveRegister, proveTransfer } from "stellar-confidential-token-sdk/node";
import { ChainClient, keypairSigner, hybridFetchEvents } from "stellar-confidential-token-sdk/chain";

// --- deployment ------------------------------------------------------------

const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK = Networks.TESTNET;

const CONTRACTS = {
  token: process.env.TOKEN_CONTRACT ?? "CBFOJTALVTO3LPZZHEXDD44K7RQKQJGAASF6XOKP5FWZD6WYKV4WN7HF",
  verifier: process.env.VERIFIER_CONTRACT ?? "CBXEPTSEC3433EH3TKUZSSZCIWIDMGZDY2FB7BN5IJ76A2JISQF4YTN6",
  auditor: process.env.AUDITOR_CONTRACT ?? "CDCPR4AURWJQRY4KXSRU7H7ABKIHTDORSQABIOUH37DU3IGYV5LRCHEK",
};
const AUDITOR_ID = 0;

/** Deposit 100 XLM, then send 40 of it confidentially. */
const DEPOSIT_STROOPS = 100n * 10_000_000n;
const TRANSFER_STROOPS = 40n * 10_000_000n;

// --- helpers ---------------------------------------------------------------

const addr = (a) => new Address(a).toScVal();
const u32 = (n) => xdr.ScVal.scvU32(n);
const i128Val = (v) => nativeToScVal(v, { type: "i128" });
const bytesVal = (b) => xdr.ScVal.scvBytes(Buffer.from(b));

function log(step, msg) {
  console.log(`\n[${step}] ${msg}`);
}

/**
 * Keep only the events that concern `address`. The state engine's receiving
 * balance is a running sum over credits, so feeding it an unrelated account's
 * transfer would corrupt the reconstruction.
 */
function eventsFor(address, events) {
  return events.filter((ev) => {
    switch (ev.type) {
      case "register":
      case "merge":
        return ev.account === address;
      case "deposit":
      case "withdraw":
      case "transfer":
        return ev.from === address || ev.to === address;
      default:
        return false;
    }
  });
}

/** Rebuild an account's local openings from the chain, from genesis. */
async function rebuildState(client, address, keys) {
  const engine = new StateEngine({ address, keys });
  const { events } = await hybridFetchEvents(client, undefined, { fromLedger: 0 });
  engine.ingestEvents(eventsFor(address, events));
  return engine;
}

async function fundAccount(publicKey) {
  const res = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
  if (!res.ok && res.status !== 400) {
    throw new Error(`friendbot failed for ${publicKey}: ${res.status}`);
  }
  // 400 means "already funded", which is fine.
}

/**
 * Derive a confidential identity for a Stellar keypair, per §5.1. The keypair
 * signs the SEP-0053 message; the signature IS the root. Nothing is persisted.
 */
function confidentialIdentity(kp) {
  const message = skSigningMessage(CONTRACTS.token, kp.publicKey());
  const root = new Uint8Array(kp.signMessage(Buffer.from(message)));
  const { sk, addrF } = deriveSk(root, CONTRACTS.token, kp.publicKey());
  return { keys: deriveKeys(sk, addrF, addressToField(kp.publicKey())), address: kp.publicKey() };
}

// --- flow ------------------------------------------------------------------

async function main() {
  const client = new ChainClient({
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK,
    contracts: CONTRACTS,
  });

  // Fixed seeds when supplied, so the demo account the site publishes can be
  // rebuilt on a fresh deployment instead of drifting to a new address.
  const alice = process.env.ALICE_SECRET
    ? Keypair.fromSecret(process.env.ALICE_SECRET)
    : Keypair.random();
  const bob = process.env.BOB_SECRET
    ? Keypair.fromSecret(process.env.BOB_SECRET)
    : Keypair.random();
  const aliceSigner = keypairSigner(alice.secret(), NETWORK);
  const bobSigner = keypairSigner(bob.secret(), NETWORK);

  log("0", `Alice ${alice.publicKey()}`);
  console.log(`    Bob   ${bob.publicKey()}`);

  log("1", "Funding both accounts from friendbot…");
  await Promise.all([fundAccount(alice.publicKey()), fundAccount(bob.publicKey())]);
  console.log("    funded");

  log("2", "Deriving confidential secrets per SDK.md §5.1 (nothing stored)…");
  const aliceId = confidentialIdentity(alice);
  const bobId = confidentialIdentity(bob);
  console.log(`    Alice vk = ${aliceId.keys.vk.toString(16).slice(0, 16)}…`);
  console.log(`    Bob   vk = ${bobId.keys.vk.toString(16).slice(0, 16)}…`);

  // Deriving twice must give the same key — that is the recoverability property.
  const again = confidentialIdentity(alice);
  if (again.keys.sk !== aliceId.keys.sk) throw new Error("derivation is not deterministic");
  console.log("    re-derived Alice from the same signer → identical sk ✓");

  log("3", "Reading the auditor key from the auditor contract…");
  const kAud = await client.auditorKey(AUDITOR_ID);
  console.log(`    K_aud ok`);

  log("4", "Registering both accounts on the live contract (real UltraHonk proofs)…");
  for (const [name, id, signer] of [
    ["Alice", aliceId, aliceSigner],
    ["Bob", bobId, bobSigner],
  ]) {
    if (await client.isRegistered(id.address)) {
      console.log(`    ${name} already registered`);
      continue;
    }
    const t0 = Date.now();
    const { payload } = await proveRegister(id.keys);
    console.log(`    ${name}: proof generated in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    const res = await client.invoke(
      CONTRACTS.token,
      "register",
      [addr(id.address), u32(AUDITOR_ID), bytesVal(payload)],
      signer,
    );
    console.log(`    ${name} registered — tx ${res.hash}`);
  }

  log("5", `Alice deposits ${DEPOSIT_STROOPS / 10_000_000n} XLM (public, by design)…`);
  const dep = await client.invoke(
    CONTRACTS.token,
    "deposit",
    [addr(alice.publicKey()), addr(alice.publicKey()), i128Val(DEPOSIT_STROOPS)],
    aliceSigner,
  );
  console.log(`    tx ${dep.hash}`);

  log("6", "Alice merges receiving → spendable…");
  const mrg = await client.invoke(
    CONTRACTS.token,
    "merge",
    [addr(alice.publicKey())],
    aliceSigner,
  );
  console.log(`    tx ${mrg.hash}`);

  log("7", "Rebuilding Alice's local state from chain events…");
  const engine = await rebuildState(client, alice.publicKey(), aliceId.keys);
  const state = engine.state();
  console.log(`    spendable = ${state.spendable.v} stroops (${state.spendable.v / 10_000_000n} XLM)`);
  if (state.spendable.v !== DEPOSIT_STROOPS) {
    throw new Error(`expected ${DEPOSIT_STROOPS} spendable, got ${state.spendable.v}`);
  }

  log("8", `Alice sends ${TRANSFER_STROOPS / 10_000_000n} XLM confidentially to Bob…`);
  const t0 = Date.now();
  const transfer = await proveTransfer({
    keys: aliceId.keys,
    v: state.spendable.v,
    r: state.spendable.r,
    amount: TRANSFER_STROOPS,
    pvkB: bobId.keys.PVK,
    kAudR: kAud,
    kAudS: kAud,
  });
  console.log(`    proof generated in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const tx = await client.invoke(
    CONTRACTS.token,
    "confidential_transfer",
    [addr(alice.publicKey()), addr(bob.publicKey()), bytesVal(transfer.payload)],
    aliceSigner,
  );
  console.log(`    tx ${tx.hash}`);
  console.log(`    https://stellar.expert/explorer/testnet/tx/${tx.hash}`);

  log("9", "Verifying: the amount is hidden on-chain, but Bob can read it…");
  // Bob rebuilds from nothing but his own derived key and the public chain.
  const bobEngine = await rebuildState(client, bob.publicKey(), bobId.keys);
  const bobReceiving = bobEngine.receiving();
  console.log(`    Bob decrypted a receiving balance of ${bobReceiving.v} stroops`);
  if (bobReceiving.v !== TRANSFER_STROOPS) {
    throw new Error(`Bob expected ${TRANSFER_STROOPS}, decrypted ${bobReceiving.v}`);
  }

  log("10", "Verifying local state against the chain's commitments…");
  const aliceAfter = await rebuildState(client, alice.publicKey(), aliceId.keys);
  const onchain = await client.confidentialBalance(alice.publicKey());
  const check = aliceAfter.verifyAgainstChain({
    spendableC: pointToBytes(onchain.spendableBalance),
    receivingC: pointToBytes(onchain.receivingBalance),
  });
  console.log(`    ${JSON.stringify(check)}`);
  if (!check.ok) throw new Error("local state does not match the chain");

  console.log("\n✅ A confidential payment settled on testnet. The amount never appeared on-chain.");
  console.log("\nTo watch the client reject a lying archive over this same history:");
  console.log(`  ALICE_SECRET=${alice.secret()} node examples/sabotage.mjs`);
}

main().catch((e) => {
  console.error("\n❌ " + (e?.message ?? e));
  if (e?.stack) console.error(e.stack.split("\n").slice(1, 4).join("\n"));
  process.exit(1);
});
