/**
 * Build a condominium's month of dues on testnet.
 *
 * Eight units each pay their monthly dues to the building, confidentially. The
 * amounts differ. A studio does not pay what the penthouse pays, and none of
 * them appear on-chain.
 *
 * What makes this worth showing is a property of Pedersen commitments rather
 * than of any clever protocol: commitments ADD. The building's receiving
 * balance on-chain is the sum of the eight payment commitments, so the building
 * can publish one number, what it collected this month, and anyone can check
 * that number against the chain WITHOUT learning what any single neighbour
 * paid. A normal ledger makes you choose between an auditable total and private
 * line items. This does not.
 *
 * Run:  node examples/condominium.mjs
 *
 * Progress is written to examples/condominium-state.json after every step, and
 * re-running resumes. Thirty-odd real transactions is too many to redo because
 * one RPC call timed out.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Keypair, Networks, Address, nativeToScVal, xdr } from "@stellar/stellar-sdk";

import {
  deriveSk,
  deriveKeys,
  skSigningMessage,
  pointToBytes,
  StateEngine,
  addressToField,
} from "stellar-confidential-token-sdk";
import { proveRegister, proveTransfer } from "stellar-confidential-token-sdk/node";
import { ChainClient, keypairSigner, hybridFetchEvents } from "stellar-confidential-token-sdk/chain";

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(HERE, "condominium-state.json");

const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK = Networks.TESTNET;
const CONTRACTS = {
  token: process.env.TOKEN_CONTRACT ?? "CBFOJTALVTO3LPZZHEXDD44K7RQKQJGAASF6XOKP5FWZD6WYKV4WN7HF",
  verifier: process.env.VERIFIER_CONTRACT ?? "CBXEPTSEC3433EH3TKUZSSZCIWIDMGZDY2FB7BN5IJ76A2JISQF4YTN6",
  auditor: process.env.AUDITOR_CONTRACT ?? "CDCPR4AURWJQRY4KXSRU7H7ABKIHTDORSQABIOUH37DU3IGYV5LRCHEK",
};
const AUDITOR_ID = 0;

const XLM = 10_000_000n;

/**
 * Eight units, with dues that differ by size. Varied amounts matter: if every
 * unit paid the same, an observer could divide the total by eight and learn
 * every line item, and the privacy claim would be theatre.
 */
const UNITS = [
  { id: "1A", label: "Studio", dues: 12n * XLM },
  { id: "1B", label: "One-bed", dues: 18n * XLM },
  { id: "2A", label: "Two-bed", dues: 25n * XLM },
  { id: "2B", label: "Two-bed", dues: 25n * XLM },
  { id: "3A", label: "Three-bed", dues: 34n * XLM },
  { id: "3B", label: "Three-bed", dues: 34n * XLM },
  { id: "4A", label: "Penthouse", dues: 51n * XLM },
  { id: "4B", label: "Penthouse (arrears)", dues: 63n * XLM },
];

/** Enough to cover dues plus fees, with room to spare. */
const UNIT_DEPOSIT = 90n * XLM;

const addr = (a) => new Address(a).toScVal();
const u32 = (n) => xdr.ScVal.scvU32(n);
const i128 = (v) => nativeToScVal(v, { type: "i128" });
const bytes = (b) => xdr.ScVal.scvBytes(Buffer.from(b));

const load = () => (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {});
const save = (s) => writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + "\n");

function log(msg) {
  console.log(msg);
}

async function fund(publicKey) {
  const res = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
  if (!res.ok && res.status !== 400) throw new Error(`friendbot ${res.status} for ${publicKey}`);
}

/** §5.1: the confidential secret is derived from a signature, never stored. */
function identity(kp) {
  const message = skSigningMessage(CONTRACTS.token, kp.publicKey());
  const root = new Uint8Array(kp.signMessage(Buffer.from(message)));
  const { sk, addrF } = deriveSk(root, CONTRACTS.token, kp.publicKey());
  return deriveKeys(sk, addrF, addressToField(kp.publicKey()));
}

function eventsFor(address, events) {
  return events.filter((ev) =>
    ev.type === "register" || ev.type === "merge"
      ? ev.account === address
      : ev.from === address || ev.to === address,
  );
}

async function rebuild(client, address, keys, fromLedger) {
  const engine = new StateEngine({ address, keys });
  const { events } = await hybridFetchEvents(client, undefined, { fromLedger });
  engine.ingestEvents(eventsFor(address, events));
  return engine;
}

async function main() {
  const state = load();
  const client = new ChainClient({
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK,
    contracts: CONTRACTS,
  });

  // --- accounts ------------------------------------------------------------

  state.building ??= Keypair.random().secret();
  state.units ??= Object.fromEntries(UNITS.map((u) => [u.id, Keypair.random().secret()]));
  state.fromLedger ??= (await client.server.getHealth()).latestLedger;
  save(state);

  const buildingKp = Keypair.fromSecret(state.building);
  const buildingKeys = identity(buildingKp);
  log(`\nBuilding account  ${buildingKp.publicKey()}`);
  log(`Indexing from ledger ${state.fromLedger}\n`);

  const kAud = await client.auditorKey(AUDITOR_ID);

  // --- register everyone ---------------------------------------------------

  state.done ??= {};
  const everyone = [
    { id: "building", kp: buildingKp, keys: buildingKeys },
    ...UNITS.map((u) => {
      const kp = Keypair.fromSecret(state.units[u.id]);
      return { id: u.id, kp, keys: identity(kp), unit: u };
    }),
  ];

  for (const p of everyone) {
    if (state.done[`fund:${p.id}`]) continue;
    await fund(p.kp.publicKey());
    state.done[`fund:${p.id}`] = true;
    save(state);
  }
  log("funded all accounts");

  for (const p of everyone) {
    if (state.done[`register:${p.id}`]) continue;
    if (await client.isRegistered(p.kp.publicKey())) {
      state.done[`register:${p.id}`] = true;
      save(state);
      continue;
    }
    const { payload } = await proveRegister(p.keys);
    const res = await client.invoke(
      CONTRACTS.token,
      "register",
      [addr(p.kp.publicKey()), u32(AUDITOR_ID), bytes(payload)],
      keypairSigner(p.kp.secret(), NETWORK),
    );
    state.done[`register:${p.id}`] = res.hash;
    save(state);
    log(`  registered ${p.id}`);
  }
  log("registered building + 8 units");

  // --- each unit funds its confidential balance ----------------------------

  for (const p of everyone.filter((x) => x.unit)) {
    const signer = keypairSigner(p.kp.secret(), NETWORK);

    if (!state.done[`deposit:${p.id}`]) {
      const res = await client.invoke(
        CONTRACTS.token,
        "deposit",
        [addr(p.kp.publicKey()), addr(p.kp.publicKey()), i128(UNIT_DEPOSIT)],
        signer,
      );
      state.done[`deposit:${p.id}`] = res.hash;
      save(state);
    }
    if (!state.done[`merge:${p.id}`]) {
      const res = await client.invoke(
        CONTRACTS.token,
        "merge",
        [addr(p.kp.publicKey())],
        signer,
      );
      state.done[`merge:${p.id}`] = res.hash;
      save(state);
      log(`  unit ${p.id} funded`);
    }
  }
  log("all units hold a spendable balance");

  // --- the month's dues ----------------------------------------------------

  state.payments ??= {};
  for (const p of everyone.filter((x) => x.unit)) {
    if (state.payments[p.id]) continue;

    const engine = await rebuild(client, p.kp.publicKey(), p.keys, state.fromLedger);
    const spendable = engine.spendable();

    const transfer = await proveTransfer({
      keys: p.keys,
      v: spendable.v,
      r: spendable.r,
      amount: p.unit.dues,
      pvkB: buildingKeys.PVK,
      kAudR: kAud,
      kAudS: kAud,
    });

    const res = await client.invoke(
      CONTRACTS.token,
      "confidential_transfer",
      [addr(p.kp.publicKey()), addr(buildingKp.publicKey()), bytes(transfer.payload)],
      keypairSigner(p.kp.secret(), NETWORK),
    );

    state.payments[p.id] = { tx: res.hash, dues: p.unit.dues.toString() };
    save(state);
    log(`  ${p.id} paid, tx ${res.hash.slice(0, 12)}…`);
  }
  log("\nall dues paid");

  // --- what the building can now prove -------------------------------------

  const engine = await rebuild(client, buildingKp.publicKey(), buildingKeys, state.fromLedger);
  const receiving = engine.receiving();
  const expected = UNITS.reduce((n, u) => n + u.dues, 0n);

  log(`\nCollected this month: ${receiving.v / XLM} XLM`);
  if (receiving.v !== expected) {
    throw new Error(`expected ${expected}, the building reconstructed ${receiving.v}`);
  }

  const onchain = await client.confidentialBalance(buildingKp.publicKey());
  const check = engine.verifyAgainstChain({
    spendableC: pointToBytes(onchain.spendableBalance),
    receivingC: pointToBytes(onchain.receivingBalance),
  });
  log(`Matches the chain's commitment: ${check.receivingOk}`);

  state.summary = {
    building: buildingKp.publicKey(),
    buildingSecret: buildingKp.secret(),
    fromLedger: state.fromLedger,
    totalStroops: receiving.v.toString(),
    units: UNITS.map((u) => ({
      ...u,
      dues: u.dues.toString(),
      address: Keypair.fromSecret(state.units[u.id]).publicKey(),
      tx: state.payments[u.id]?.tx,
    })),
  };
  save(state);

  log(`\nWrote ${STATE_FILE}`);
  log("The eight individual amounts never appeared on-chain.");
}

main().catch((e) => {
  console.error(`\n${e?.message ?? e}`);
  console.error("Re-run to resume, completed steps are recorded.");
  process.exit(1);
});
