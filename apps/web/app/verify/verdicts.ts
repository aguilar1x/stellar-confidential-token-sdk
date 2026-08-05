/**
 * Run the real client against one archive and report what it concluded.
 *
 * This is a server action rather than browser code for one reason: it is the
 * same code path `examples/sabotage.mjs` runs from a terminal, so what the page
 * shows and what a reviewer reproduces locally cannot drift apart.
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
import {
  ChainClient,
  IndexerV1Client,
  IncompleteHistoryError,
} from "stellar-confidential-token-sdk/chain";

import {
  CONTRACTS,
  DEMO,
  EXTERNAL_ARCHIVE,
  NETWORK_PASSPHRASE,
  RPC_URL,
  type ArchiveId,
} from "@/lib/demo";

export interface Verdict {
  archive: ArchiveId;
  accepted: boolean;
  /** Which layer decided: C3 (the archive admitted a gap) or §7 (the chain). */
  caughtBy: "C3" | "§7" | null;
  detail: string;
  /** What this archive would have convinced the wallet it owned. */
  reported?: { spendable: string; receiving: string };
  /** The truth, from the chain. */
  truth?: { spendable: string; receiving: string };
}

function eventsFor(address: string, events: readonly { type: string; [k: string]: unknown }[]) {
  return events.filter((ev) =>
    ev.type === "register" || ev.type === "merge"
      ? ev.account === address
      : ev.from === address || ev.to === address,
  );
}

export async function judge(archive: ArchiveId, origin: string): Promise<Verdict> {
  const address = DEMO.alice;

  const chain = new ChainClient({
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    contracts: CONTRACTS,
  });

  const onchain = await chain.confidentialBalance(address);
  if (!onchain) {
    return {
      archive,
      accepted: false,
      caughtBy: null,
      detail: "the demo account is not registered on this contract",
    };
  }

  const kp = Keypair.fromSecret(DEMO.aliceSecret);
  const root = new Uint8Array(
    kp.signMessage(Buffer.from(skSigningMessage(CONTRACTS.token, address))),
  );
  const { sk, addrF } = deriveSk(root, CONTRACTS.token, address);
  const keys = deriveKeys(sk, addrF);

  // The independent archive is a real, separately-deployed service; the rest are
  // served by this deployment. Same client either way — that is the point.
  const client = new IndexerV1Client({
    baseUrl: archive === "independent" ? EXTERNAL_ARCHIVE : `${origin}/api/archive/${archive}`,
    label: archive,
  });

  let events;
  try {
    // Ask C4 what this archive covers before asking for history. An archive
    // built by scanning an RPC begins above genesis, so requesting from ledger
    // one would draw an honest `complete: false` from every archive — including
    // the faithful one — and the demo would show four rejections for the wrong
    // reason. A real client does the same thing: it asks within the range the
    // archive claims, and then verifies the result against the chain anyway.
    const status = await client.health();

    const res = await client.fetchEvents({
      contractId: CONTRACTS.token,
      account: address,
      fromLedger: status.ingestedFrom,
      toLedger: status.ingestedThrough,
    });
    events = res.events;
  } catch (e) {
    if (e instanceof IncompleteHistoryError) {
      return {
        archive,
        accepted: false,
        caughtBy: "C3",
        detail:
          "The archive admitted it cannot vouch for the whole range. " +
          "The client refused it before replaying a single event — a partial " +
          "history reconstructs a wrong balance.",
      };
    }
    return { archive, accepted: false, caughtBy: null, detail: String((e as Error)?.message ?? e) };
  }

  const engine = new StateEngine({ address, keys });
  engine.ingestEvents(eventsFor(address, events as never) as never);
  const state = engine.state();

  const check = engine.verifyAgainstChain({
    spendableC: pointToBytes(onchain.spendableBalance),
    receivingC: pointToBytes(onchain.receivingBalance),
  });

  const reported = {
    spendable: state.spendable.v.toString(),
    receiving: state.receiving.v.toString(),
  };
  const truth = {
    spendable: DEMO.expectedSpendableStroops.toString(),
    receiving: "0",
  };

  if (check.ok) {
    return {
      archive,
      accepted: true,
      caughtBy: "§7",
      detail:
        "Every reconstructed opening matches the commitment the chain holds. " +
        "The archive was believed because it was checked, not because it was trusted.",
      reported,
      truth,
    };
  }

  const which = [check.spendableOk ? null : "spendable", check.receivingOk ? null : "receiving"]
    .filter(Boolean)
    .join(" and ");

  return {
    archive,
    accepted: false,
    caughtBy: "§7",
    detail:
      `The archive claimed a complete history, so the completeness signal could ` +
      `not help. It was caught because the reconstructed ${which} opening does ` +
      `not match the commitment on-chain.`,
    reported,
    truth,
  };
}
