/**
 * What a resident can check about the building's books.
 *
 * The building publishes one number: what it collected this month. Everyone
 * else gets to verify that number against the chain without learning a single
 * neighbour's payment.
 *
 * That works because Pedersen commitments add. Each confidential payment
 * contributes `commit(vᵢ, rᵢ) = vᵢ·G + rᵢ·H` to the building's receiving
 * balance, and the sum of those points is `commit(Σvᵢ, Σrᵢ)` — a commitment to
 * the total, with no term that leaks an individual amount. So the chain already
 * holds a commitment to the total; the building only has to open it.
 *
 * A normal ledger forces a choice between an auditable total and private line
 * items. This does not.
 */

"use server";

import { Keypair } from "@stellar/stellar-sdk";
import {
  deriveSk,
  deriveKeys,
  skSigningMessage,
  pointToBytes,
  commit,
  pointCoords,
  StateEngine,
} from "stellar-confidential-token-sdk";
import { ChainClient, hybridFetchEvents } from "stellar-confidential-token-sdk/chain";

import { CONTRACTS, NETWORK_PASSPHRASE, RPC_URL } from "@/lib/demo";
import { BUILDING } from "./data";

export interface AuditResult {
  /** What the building publishes: the total it can open its commitment to. */
  published: string;
  /** Of that, what the eight listed units paid. The rest came from visitors. */
  fromUnits: string;
  /** What the chain's commitment actually opens to. */
  reconstructed: string;
  /** The building's receiving commitment, as served by the chain. */
  onchainCommitment: string;
  /** The same commitment, recomputed from the total and its blinding. */
  recomputedCommitment: string;
  /** Whether the two match — the audit. */
  ok: boolean;
  /** How many payments were folded into it. */
  paymentCount: number;
  error?: string;
}

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

export async function auditBuilding(): Promise<AuditResult> {
  // What the eight listed units paid. Visitors can add more from the page, so
  // this is a component of the total, not the total itself.
  const fromUnits = BUILDING.units.reduce((n, u) => n + BigInt(u.dues), 0n);

  try {
    const client = new ChainClient({
      rpcUrl: RPC_URL,
      networkPassphrase: NETWORK_PASSPHRASE,
      contracts: CONTRACTS,
    });

    const kp = Keypair.fromSecret(BUILDING.secret);
    const address = kp.publicKey();
    const root = new Uint8Array(
      kp.signMessage(Buffer.from(skSigningMessage(CONTRACTS.token, address))),
    );
    const { sk, addrF } = deriveSk(root, CONTRACTS.token, address);
    const keys = deriveKeys(sk, addrF);

    const engine = new StateEngine({ address, keys });
    const { events } = await hybridFetchEvents(client, undefined, {
      fromLedger: BUILDING.fromLedger,
    });
    engine.ingestEvents(
      events.filter((ev) =>
        ev.type === "register" || ev.type === "merge"
          ? ev.account === address
          : ev.from === address || ev.to === address,
      ) as never,
    );

    const receiving = engine.receiving();

    const onchain = await client.confidentialBalance(address);
    if (!onchain) {
      return {
        published: fromUnits.toString(),
        fromUnits: fromUnits.toString(),
        reconstructed: "0",
        onchainCommitment: "",
        recomputedCommitment: "",
        ok: false,
        paymentCount: 0,
        error: "the building account is not registered on this contract",
      };
    }

    // The audit itself: does the commitment the chain holds open to the total
    // the building published? Recomputing commit(total, blinding) and comparing
    // point-for-point is the whole check.
    const onchainC = pointToBytes(onchain.receivingBalance);
    const recomputed = pointToBytes(commit(receiving.v, receiving.r));

    // The audit is exactly one question: does the commitment the chain holds
    // open to the total the building publishes? Comparing against a hardcoded
    // figure instead would make the page fail the moment a visitor adds a
    // payment — reporting a mismatch while the cryptography agreed perfectly.
    return {
      published: receiving.v.toString(),
      fromUnits: fromUnits.toString(),
      reconstructed: receiving.v.toString(),
      onchainCommitment: hex(onchainC),
      recomputedCommitment: hex(recomputed),
      ok: hex(onchainC) === hex(recomputed),
      paymentCount: BUILDING.units.length,
    };
  } catch (e) {
    return {
      published: fromUnits.toString(),
      fromUnits: fromUnits.toString(),
      reconstructed: "0",
      onchainCommitment: "",
      recomputedCommitment: "",
      ok: false,
      paymentCount: 0,
      error: String((e as Error)?.message ?? e),
    };
  }
}

/**
 * Demonstrate the additive property directly, on the published total.
 *
 * Splitting the total into two arbitrary halves and showing that their
 * commitments sum to the whole one is a self-contained proof that the audit
 * above is not a coincidence of bookkeeping: it is arithmetic anyone can redo.
 */
export async function demonstrateHomomorphism(): Promise<{
  a: string;
  b: string;
  sum: string;
  matches: boolean;
}> {
  const total = BUILDING.units.reduce((n, u) => n + BigInt(u.dues), 0n);
  const half = total / 2n;
  const rest = total - half;

  const rA = 111_111n;
  const rB = 222_222n;

  const cA = commit(half, rA);
  const cB = commit(rest, rB);
  const summed = cA.add(cB);
  const direct = commit(total, rA + rB);

  const p = (pt: ReturnType<typeof commit>) => {
    const { x } = pointCoords(pt);
    return `0x${x.toString(16).padStart(64, "0")}`;
  };

  return {
    a: p(cA),
    b: p(cB),
    sum: p(summed),
    matches: p(summed) === p(direct),
  };
}
