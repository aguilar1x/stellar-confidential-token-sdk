/**
 * The hero's one live fact.
 *
 * A hero that asserted "amounts are hidden" would be a claim. Showing the
 * building's actual commitment — the bytes the chain holds in place of what it
 * collected — makes the claim checkable in the same breath: the hex discloses
 * nothing, and the total beside it is what the client proved that hex opens to.
 *
 * If the chain or the RPC is unreachable, the page must not invent a number.
 * It falls back to showing the commitment shape with no verdict, which is
 * honest about being offline rather than quietly serving a fiction.
 */

"use server";

import { Keypair } from "@stellar/stellar-sdk";
import {
  deriveSk,
  deriveKeys,
  skSigningMessage,
  pointToBytes,
  StateEngine,
} from "stellar-confidential-token-sdk";
import { ChainClient, hybridFetchEvents } from "stellar-confidential-token-sdk/chain";

import { CONTRACTS, NETWORK_PASSPHRASE, RPC_URL } from "@/lib/demo";
import { BUILDING } from "./demo/data";

const PLACEHOLDER = "0".repeat(128);

export interface HeroFacts {
  commitment: string;
  total: string;
  verified: boolean;
}

export async function heroCommitment(): Promise<HeroFacts> {
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

    const onchain = await client.confidentialBalance(address);
    if (!onchain) return { commitment: PLACEHOLDER, total: "not read", verified: false };

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

    const check = engine.verifyAgainstChain({
      spendableC: pointToBytes(onchain.spendableBalance),
      receivingC: pointToBytes(onchain.receivingBalance),
    });

    const collected = engine.receiving().v;

    return {
      commitment: Buffer.from(pointToBytes(onchain.receivingBalance)).toString("hex"),
      total: `${Number(collected) / 10_000_000} XLM`,
      verified: check.receivingOk,
    };
  } catch {
    return { commitment: PLACEHOLDER, total: "not read", verified: false };
  }
}
