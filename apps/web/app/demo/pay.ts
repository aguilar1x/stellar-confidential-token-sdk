/**
 * Add a real payment to the building, from the website.
 *
 * This is the page's one destructive-ish control, and everything about it is
 * genuine: a proof is generated, a transaction is submitted to Stellar testnet,
 * and the building's on-chain commitment changes as a result. Nothing is
 * simulated, and the audit that runs afterwards is the same audit that ran
 * before.
 *
 * It exists because the argument on this page — that a total stays auditable
 * while its line items stay sealed — is far more convincing when the visitor is
 * the one who moves the number.
 *
 * The guest account is pre-funded by `examples/setup-guest.mjs` with far more
 * than the demo will spend. When it does run dry the caller gets a plain
 * message saying so, because a demo that fails silently is worse than one that
 * admits it needs topping up.
 */

"use server";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Keypair, Address, xdr } from "@stellar/stellar-sdk";
import {
  deriveSk,
  deriveKeys,
  skSigningMessage,
  StateEngine,
} from "stellar-confidential-token-sdk";
import { proveTransfer } from "stellar-confidential-token-sdk/node";
import { ChainClient, keypairSigner, hybridFetchEvents } from "stellar-confidential-token-sdk/chain";

import { CONTRACTS, NETWORK_PASSPHRASE, RPC_URL } from "@/lib/demo";
import { BUILDING } from "./data";

const XLM = 10_000_000n;

/** Small enough that the guest balance lasts, large enough to read as money. */
const AMOUNT = 3n * XLM;

export interface PaymentResult {
  ok: boolean;
  /** Explorer-linkable hash, when it settled. */
  tx?: string;
  /** The amount paid, in stroops — the one number the visitor is told. */
  amountStroops?: string;
  error?: string;
}

function guest() {
  const path = join(process.cwd(), "..", "..", "examples", "guest-state.json");
  const state = JSON.parse(readFileSync(path, "utf8")) as {
    secret: string;
    address: string;
    fromLedger: number;
  };
  return state;
}

export async function payDues(): Promise<PaymentResult> {
  try {
    const g = guest();
    const kp = Keypair.fromSecret(g.secret);
    const address = kp.publicKey();

    const client = new ChainClient({
      rpcUrl: RPC_URL,
      networkPassphrase: NETWORK_PASSPHRASE,
      contracts: CONTRACTS,
    });

    // Derive the guest's confidential identity the same way any wallet would.
    const root = new Uint8Array(
      kp.signMessage(Buffer.from(skSigningMessage(CONTRACTS.token, address))),
    );
    const { sk, addrF } = deriveSk(root, CONTRACTS.token, address);
    const keys = deriveKeys(sk, addrF);

    // Rebuild its spendable opening from the chain. The guest's own history is
    // read the same way the building's is — there is no privileged path here.
    const engine = new StateEngine({ address, keys });
    const { events } = await hybridFetchEvents(client, undefined, {
      fromLedger: g.fromLedger,
    });
    engine.ingestEvents(
      events.filter((ev) =>
        ev.type === "register" || ev.type === "merge"
          ? ev.account === address
          : ev.from === address || ev.to === address,
      ) as never,
    );

    const spendable = engine.spendable();
    if (spendable.v < AMOUNT) {
      return {
        ok: false,
        error:
          "The demo wallet has run out of testnet funds. Everything else on this page still works — re-run examples/setup-guest.mjs to top it up.",
      };
    }

    // Recipient viewing key: the building's, derived from its published key.
    const bKp = Keypair.fromSecret(BUILDING.secret);
    const bRoot = new Uint8Array(
      bKp.signMessage(Buffer.from(skSigningMessage(CONTRACTS.token, BUILDING.address))),
    );
    const bDerived = deriveSk(bRoot, CONTRACTS.token, BUILDING.address);
    const buildingKeys = deriveKeys(bDerived.sk, bDerived.addrF);

    const kAud = await client.auditorKey(0);

    const { payload } = await proveTransfer({
      keys,
      v: spendable.v,
      r: spendable.r,
      amount: AMOUNT,
      pvkB: buildingKeys.PVK,
      kAudR: kAud,
      kAudS: kAud,
    });

    const res = await client.invoke(
      CONTRACTS.token,
      "confidential_transfer",
      [
        new Address(address).toScVal(),
        new Address(BUILDING.address).toScVal(),
        xdr.ScVal.scvBytes(Buffer.from(payload)),
      ],
      keypairSigner(g.secret, NETWORK_PASSPHRASE),
    );

    return { ok: true, tx: res.hash, amountStroops: AMOUNT.toString() };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}
