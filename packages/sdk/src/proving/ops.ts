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

import type { CompiledCircuit } from "@noir-lang/noir_js";

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

/**
 * Extract the `data: Bytes` argument from an encoder's envelope.
 *
 * The encoders in `chain/payload.ts` already return `scvBytes(<map XDR>)` — the
 * finished `Bytes` ScVal. What the contract wants is the raw bytes INSIDE it,
 * because the invocation layer applies its own `scvBytes` wrap when building
 * the argument.
 *
 * Calling `.toXDR()` here instead would serialize the whole `scvBytes(...)`
 * wrapper, so the contract receives bytes-of-a-bytes-ScVal and rejects the call
 * with `InvalidData` (#3507) — after the proof has already been generated, so
 * the failure looks like a proving problem when it is purely an encoding one.
 */
function envelopeBytes(scVal: { bytes(): Uint8Array }): Uint8Array {
  return new Uint8Array(scVal.bytes());
}

/**
 * Prove account registration for `keys`.
 *
 * `acctF` is `address_to_field(account)`. The register circuit takes it as a
 * public input that no gate reads: UltraHonk absorbs every public input into
 * the transcript, so a proof made for one account will not verify when the
 * contract assembles the blob for another. Omit it only if `keys` already
 * carries it from `deriveKeys(sk, addrF, acctF)`.
 */
export async function proveRegister(keys: KeyPair, acctF?: bigint): Promise<ProofEnvelope> {
  const witness = buildRegisterWitness(keys, acctF);
  const prover = new CircuitProver(loadCircuit("register"));
  try {
    const { proof } = await prover.prove(witness.inputs);
    const payload = envelopeBytes(encodeRegisterData(witness, proof));
    return { payload, proof };
  } finally {
    await prover.destroy();
  }
}

/**
 * Prove a confidential transfer described by `params`.
 *
 * `circuit` overrides where the compiled artifact comes from. The default reads
 * the vendored one off disk, which needs the file to still be there at runtime —
 * and a bundler that cannot see a path resolved at runtime will prune it. Any
 * caller whose deployment traces its own dependencies (Next, Vercel, a Lambda
 * zip) should import the artifact so the bundle includes it, and hand it in here
 * rather than reimplementing this function around `CircuitProver`.
 */
export async function proveTransfer(
  params: TransferParams,
  circuit?: CompiledCircuit,
): Promise<TransferEnvelope> {
  const witness = buildTransferWitness(params);
  const prover = new CircuitProver(circuit ?? loadCircuit("transfer"));
  try {
    const { proof } = await prover.prove(witness.inputs);
    const payload = envelopeBytes(encodeTransferData(witness, proof));
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
    const payload = envelopeBytes(encodeWithdrawData(witness, proof));
    return { payload, proof };
  } finally {
    await prover.destroy();
  }
}
