/**
 * Prove operations: tie witness → prove → payload for each proof-carrying entry
 * point. Each op builds the circuit witness (T8 `witness/*` builders), generates
 * a keccak-transcript UltraHonk proof for it, then encodes the on-chain
 * `data: Bytes` envelope (T8 `chain/payload` encoders) whose XDR bytes become
 * {@link ProofEnvelope.payload}. The raw proof bytes become {@link ProofEnvelope.proof}.
 *
 * NOTE: the witness builders require a full contract-bound {@link KeyPair}
 * (`sk`, `Y`/`PVK` as Grumpkin points, `addr_f`), which {@link AccountKeys}
 * deliberately does not expose (it is the public wrapper and never holds `sk`).
 * These ops therefore take the `KeyPair`/param objects the builders consume; the
 * state engine (a later task) derives those from the account secret and calls in.
 */

import type { KeyPair } from "../crypto/keys.js";
import type { ProofEnvelope } from "../types.js";
import { buildRegisterWitness } from "../witness/register.js";
import { buildTransferWitness, type TransferParams, type TransferWitness } from "../witness/transfer.js";
import { buildWithdrawWitness, type WithdrawParams } from "../witness/withdraw.js";
import { encodeRegisterData, encodeWithdrawData, encodeTransferData } from "../chain/payload.js";
import { CircuitProver } from "./prover.js";
import { loadCircuit } from "./artifacts.js";

/** Recipient view + ephemeral scalar the transfer op surfaces alongside the envelope. */
export type TransferEnvelope = ProofEnvelope & {
  recipientView: TransferWitness["recipientView"];
  next: TransferWitness["next"];
  rEScalar: TransferWitness["rEScalar"];
};

/** `xdr.ScVal.toXDR()` returns a Node Buffer; normalize to a plain Uint8Array. */
function toU8(b: Uint8Array): Uint8Array {
  return new Uint8Array(b);
}

/** Prove account registration for `keys`. */
export async function proveRegister(keys: KeyPair): Promise<ProofEnvelope> {
  const witness = buildRegisterWitness(keys);
  const prover = new CircuitProver(loadCircuit("register"));
  try {
    const { proof } = await prover.prove(witness.inputs);
    const payload = toU8(encodeRegisterData(witness, proof).toXDR());
    return { payload, proof };
  } finally {
    await prover.destroy();
  }
}

/** Prove a confidential transfer described by `params`. */
export async function proveTransfer(params: TransferParams): Promise<TransferEnvelope> {
  const witness = buildTransferWitness(params);
  const prover = new CircuitProver(loadCircuit("transfer"));
  try {
    const { proof } = await prover.prove(witness.inputs);
    const payload = toU8(encodeTransferData(witness, proof).toXDR());
    return {
      payload,
      proof,
      recipientView: witness.recipientView,
      next: witness.next,
      rEScalar: witness.rEScalar,
    };
  } finally {
    await prover.destroy();
  }
}

/** Prove a withdrawal described by `params`. */
export async function proveWithdraw(params: WithdrawParams): Promise<ProofEnvelope> {
  const witness = buildWithdrawWitness(params);
  const prover = new CircuitProver(loadCircuit("withdraw"));
  try {
    const { proof } = await prover.prove(witness.inputs);
    const payload = toU8(encodeWithdrawData(witness, proof).toXDR());
    return { payload, proof };
  } finally {
    await prover.destroy();
  }
}
