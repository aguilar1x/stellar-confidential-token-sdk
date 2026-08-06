/**
 * Add a real payment to the building, reporting each stage as it completes.
 *
 * Everything here is genuine: a proof is generated, a transaction is submitted
 * to Stellar testnet, and the building's on-chain commitment changes as a
 * result. Nothing is simulated, and the audit that runs afterwards is the same
 * audit that ran before.
 *
 * It takes an `emit` callback rather than returning a summary because the point
 * of the page is that a reader watches this happen. A single call that returns
 * ten seconds later can only be described after the fact; emitting at real
 * stage boundaries means the progress on screen is the server's actual position.
 * The alternative — advancing a progress bar on an estimated schedule — is the
 * one thing this page must not do.
 *
 * The guest account is pre-funded by `examples/setup-guest.mjs` with far more
 * than the demo will spend. When it does run dry the caller gets a plain
 * message saying so, because a demo that fails silently is worse than one that
 * admits it needs topping up.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Keypair, Address, xdr } from "@stellar/stellar-sdk";
import { deriveSk, deriveKeys, skSigningMessage, StateEngine } from "stellar-confidential-token-sdk";
import { proveTransfer } from "stellar-confidential-token-sdk/node";
import { ChainClient, keypairSigner, hybridFetchEvents } from "stellar-confidential-token-sdk/chain";

/**
 * Imported rather than loaded off disk on purpose.
 *
 * The SDK's own loader resolves the vendored artifact at runtime, which Next's
 * build trace cannot see — so the file gets pruned from the deployment and
 * proving fails with ENOENT only in production, after two stages have already
 * reported success. A static import puts the 71 KB into the bundle where the
 * tracer can account for it.
 */
import transferCircuit from "../../../../packages/sdk/circuits/transfer.json";

import { CONTRACTS, NETWORK_PASSPHRASE, RPC_URL } from "@/lib/demo";
import { BUILDING } from "./data";
import {
  MAX_STROOPS,
  MIN_STROOPS,
  type PaymentEvent,
  type StageKey,
  type Timings,
} from "./payment-types";

const XLM = 10_000_000n;

/**
 * The account the page spends from.
 *
 * `GUEST_SECRET` wins when set, so a deployment can fund its own throwaway
 * account instead of sharing the one committed here. The committed file is the
 * fallback rather than the only source because a fresh clone should work with
 * no setup, and because the seed in it is a testnet account holding nothing that
 * exists on no other network — checked, not assumed.
 */
function guest() {
  const fromEnv = process.env.GUEST_SECRET;
  if (fromEnv) {
    return {
      secret: fromEnv,
      address: "",
      fromLedger: Number(process.env.GUEST_FROM_LEDGER ?? 1),
    };
  }
  const path = join(process.cwd(), "..", "..", "examples", "guest-state.json");
  return JSON.parse(readFileSync(path, "utf8")) as {
    secret: string;
    address: string;
    fromLedger: number;
  };
}

export type Emit = (e: PaymentEvent) => void | Promise<void>;

export async function runPayment(amountStroops: string, emit: Emit): Promise<void> {
  // The visitor chose this number, so it is checked here rather than trusted.
  // An HTTP endpoint is public; the input box is not the boundary.
  let amount: bigint;
  try {
    amount = BigInt(amountStroops);
  } catch {
    await emit({ type: "error", error: "That is not a whole number of stroops." });
    return;
  }
  if (amount < MIN_STROOPS || amount > MAX_STROOPS) {
    await emit({
      type: "error",
      error: `Pick between 1 stroop and ${MAX_STROOPS / XLM} XLM. The demo wallet is shared, so the ceiling keeps it solvent for whoever looks next.`,
    });
    return;
  }

  const timings: Timings = {};

  /** Run one stage, announcing both ends of it and recording what it cost. */
  const stage = async <T>(key: StageKey, work: () => Promise<T> | T): Promise<T> => {
    await emit({ type: "started", stage: key });
    const t0 = performance.now();
    const out = await work();
    const ms = performance.now() - t0;
    timings[key] = ms;
    await emit({ type: "finished", stage: key, ms });
    return out;
  };

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
    const keys = await stage("derive", () => {
      const root = new Uint8Array(
        kp.signMessage(Buffer.from(skSigningMessage(CONTRACTS.token, address))),
      );
      const { sk, addrF } = deriveSk(root, CONTRACTS.token, address);
      return deriveKeys(sk, addrF);
    });

    // Rebuild its spendable opening from the chain. The guest's own history is
    // read the same way the building's is — there is no privileged path here.
    const spendable = await stage("rebuild", async () => {
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
      return engine.spendable();
    });

    if (spendable.v < amount) {
      await emit({
        type: "error",
        error:
          "The demo wallet has run out of testnet funds. Everything else on this page still works. Re-run examples/setup-guest.mjs to top it up.",
      });
      return;
    }

    // Recipient viewing key: the building's, derived from its published key.
    const bKp = Keypair.fromSecret(BUILDING.secret);
    const bRoot = new Uint8Array(
      bKp.signMessage(Buffer.from(skSigningMessage(CONTRACTS.token, BUILDING.address))),
    );
    const bDerived = deriveSk(bRoot, CONTRACTS.token, BUILDING.address);
    const buildingKeys = deriveKeys(bDerived.sk, bDerived.addrF);

    const kAud = await client.auditorKey(0);

    const payload = await stage("prove", async () => {
      const { payload } = await proveTransfer(
        {
          keys,
          v: spendable.v,
          r: spendable.r,
          amount,
          pvkB: buildingKeys.PVK,
          kAudR: kAud,
          kAudS: kAud,
        },
        transferCircuit as Parameters<typeof proveTransfer>[1],
      );
      return payload;
    });

    const res = await stage("submit", () =>
      client.invoke(
        CONTRACTS.token,
        "confidential_transfer",
        [
          new Address(address).toScVal(),
          new Address(BUILDING.address).toScVal(),
          xdr.ScVal.scvBytes(Buffer.from(payload)),
        ],
        keypairSigner(g.secret, NETWORK_PASSPHRASE),
      ),
    );

    await emit({
      type: "done",
      tx: res.hash,
      amountStroops: amount.toString(),
      payloadBytes: payload.length,
      timings,
    });
  } catch (e) {
    await emit({ type: "error", error: String((e as Error)?.message ?? e) });
  }
}
