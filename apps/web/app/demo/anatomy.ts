/**
 * One payment, opened up.
 *
 * The rest of the page argues that amounts are hidden and totals are auditable.
 * This shows the actual bytes: every field the chain stores for a single real
 * transfer, and — from those same public bytes and nothing else — the number the
 * recipient recovers.
 *
 * It matters because "hidden" is easy to claim and easy to fake. A table saying
 * "sealed" proves nothing; a list of the event's real fields, with no amount
 * anywhere in it, proves it by exhaustion.
 */

"use server";

import { Keypair } from "@stellar/stellar-sdk";
import {
  deriveSk,
  deriveKeys,
  skSigningMessage,
  pointCoords,
  StateEngine,
} from "stellar-confidential-token-sdk";
import { ChainClient, hybridFetchEvents } from "stellar-confidential-token-sdk/chain";

import { CONTRACTS, NETWORK_PASSPHRASE, RPC_URL } from "@/lib/demo";
import { BUILDING } from "./data";

export interface PaymentAnatomy {
  ok: boolean;
  txHash?: string;
  ledger?: number;
  /** Every field the contract emits for this transfer. No amount among them. */
  onChain?: { name: string; note: string; value: string }[];
  /** What the building recovers from exactly those fields. */
  decrypted?: { amount: string; blinding: string };
  error?: string;
}

const hex = (n: bigint, pad = 64) => `0x${n.toString(16).padStart(pad, "0")}`;

export async function firstPaymentAnatomy(): Promise<PaymentAnatomy> {
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

    const { events } = await hybridFetchEvents(client, undefined, {
      fromLedger: BUILDING.fromLedger,
    });

    const transfers = events
      .filter((ev) => ev.type === "transfer" && ev.to === address)
      .sort((a, b) => a.ledger - b.ledger);

    const ev = transfers[0] as
      | {
          txHash: string;
          ledger: number;
          from: string;
          to: string;
          rE: ReturnType<typeof pointCoords> extends never ? never : Parameters<typeof pointCoords>[0];
          vTilde: bigint;
          sigma: bigint;
          vAudR: bigint;
        }
      | undefined;

    if (!ev) return { ok: false, error: "no payments found for this account yet" };

    // The recipient recovers the amount from the event alone, using their
    // viewing key. Nothing private travelled with the transaction.
    const engine = new StateEngine({ address, keys });
    const { vTx, rTx } = engine.decryptIncoming(ev.rE, ev.vTilde, ev.sigma);

    const { x, y } = pointCoords(ev.rE);

    return {
      ok: true,
      txHash: ev.txHash,
      ledger: ev.ledger,
      onChain: [
        {
          name: "from",
          note: "who paid, never hidden",
          value: `${ev.from.slice(0, 8)}…${ev.from.slice(-6)}`,
        },
        {
          name: "to",
          note: "who was paid, never hidden",
          value: `${ev.to.slice(0, 8)}…${ev.to.slice(-6)}`,
        },
        {
          name: "R_e",
          note: "ephemeral public point; the recipient's half of the shared secret",
          value: `${hex(x)}\n${hex(y)}`,
        },
        {
          name: "v_tilde",
          note: "the amount plus a one-time pad. Without the viewing key it is noise",
          value: hex(ev.vTilde),
        },
        {
          name: "sigma",
          note: "per-transfer salt, so two equal payments never look alike",
          value: hex(ev.sigma),
        },
        {
          name: "v_aud_r",
          note: "the same amount, sealed to the auditor instead. Regulators get a key, not an exemption",
          value: hex(ev.vAudR),
        },
      ],
      decrypted: {
        amount: vTx.toString(),
        blinding: hex(rTx),
      },
    };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}
