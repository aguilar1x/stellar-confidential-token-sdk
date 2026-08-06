/**
 * Provision the account the website's "add a payment" button spends from.
 *
 * The demo page lets a visitor add a real payment to the building. That needs a
 * funded confidential balance sitting ready, because proving and submitting is
 * already several seconds, nobody is waiting through a register, a deposit and
 * a merge as well.
 *
 * It deposits far more than the demo will ever spend so the button keeps
 * working unattended. When it does eventually run dry the page says so plainly
 * rather than failing; see the note in the demo's payment action.
 *
 * Run:  node examples/setup-guest.mjs
 * Re-running tops the balance back up.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Keypair, Networks, Address, nativeToScVal, xdr } from "@stellar/stellar-sdk";

import { deriveSk, deriveKeys, skSigningMessage,
  addressToField,
} from "stellar-confidential-token-sdk";
import { proveRegister } from "stellar-confidential-token-sdk/node";
import { ChainClient, keypairSigner } from "stellar-confidential-token-sdk/chain";

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, "guest-state.json");

const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK = Networks.TESTNET;
const CONTRACTS = {
  token: process.env.TOKEN_CONTRACT ?? "CBFOJTALVTO3LPZZHEXDD44K7RQKQJGAASF6XOKP5FWZD6WYKV4WN7HF",
  verifier: process.env.VERIFIER_CONTRACT ?? "CBXEPTSEC3433EH3TKUZSSZCIWIDMGZDY2FB7BN5IJ76A2JISQF4YTN6",
  auditor: process.env.AUDITOR_CONTRACT ?? "CDCPR4AURWJQRY4KXSRU7H7ABKIHTDORSQABIOUH37DU3IGYV5LRCHEK",
};

const XLM = 10_000_000n;
/** Friendbot funds 10,000 XLM; leave plenty for fees. */
const DEPOSIT = 9_000n * XLM;

const addr = (a) => new Address(a).toScVal();
const u32 = (n) => xdr.ScVal.scvU32(n);
const i128 = (v) => nativeToScVal(v, { type: "i128" });
const bytes = (b) => xdr.ScVal.scvBytes(Buffer.from(b));

async function fund(pk) {
  const r = await fetch(`https://friendbot.stellar.org?addr=${pk}`);
  if (!r.ok && r.status !== 400) throw new Error(`friendbot ${r.status}`);
}

const state = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
state.secret ??= Keypair.random().secret();

const kp = Keypair.fromSecret(state.secret);
const address = kp.publicKey();
const signer = keypairSigner(state.secret, NETWORK);
const client = new ChainClient({
  rpcUrl: RPC_URL,
  networkPassphrase: NETWORK,
  contracts: CONTRACTS,
});

const root = new Uint8Array(kp.signMessage(Buffer.from(skSigningMessage(CONTRACTS.token, address))));
const { sk, addrF } = deriveSk(root, CONTRACTS.token, address);
const keys = deriveKeys(sk, addrF, addressToField(address));

console.log(`guest ${address}`);

await fund(address);
console.log("  funded");

if (!(await client.isRegistered(address))) {
  const { payload } = await proveRegister(keys);
  await client.invoke(
    CONTRACTS.token,
    "register",
    [addr(address), u32(0), bytes(payload)],
    signer,
  );
  console.log("  registered");
}

await client.invoke(
  CONTRACTS.token,
  "deposit",
  [addr(address), addr(address), i128(DEPOSIT)],
  signer,
);
console.log(`  deposited ${DEPOSIT / XLM} XLM`);

await client.invoke(CONTRACTS.token, "merge", [addr(address)], signer);
console.log("  merged into spendable");

state.address = address;
state.fromLedger ??= (await client.server.getHealth()).latestLedger - 2000;
writeFileSync(FILE, JSON.stringify(state, null, 2) + "\n");
console.log(`\nWrote ${FILE}`);
