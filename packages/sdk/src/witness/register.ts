/**
 * Register-circuit witness (design §7.2). Proves knowledge of `sk` such that
 * `Y = sk·H` and `PVK = vk·H` with `vk = Poseidon2(VIEWING_KEY, sk, addr_f)`.
 *
 * Public inputs (contract PI order): Y, PVK, addr_f.
 */

import type { KeyPair } from "../crypto/keys.js";
import type { Point } from "../crypto/grumpkin.js";
import { fieldIn, pointIn, type NoirInputs } from "./common.js";

export interface RegisterWitness {
  inputs: NoirInputs;
  /** On-chain `RegisterPayload` { y, pvk }. */
  payload: { y: Point; pvk: Point };
}

export function buildRegisterWitness(keys: KeyPair, acctF?: bigint): RegisterWitness {
  const account = acctF ?? keys.acctF;
  if (account === undefined) {
    throw new Error(
      "register needs acct_f — pass it, or derive the keys with deriveKeys(sk, addrF, acctF). " +
        "The circuit takes it as a public input so a proof cannot be replayed for another account.",
    );
  }
  const inputs: NoirInputs = {
    sk: fieldIn(keys.sk),
    ...pointIn("y", keys.Y),
    ...pointIn("pvk", keys.PVK),
    addr_f: fieldIn(keys.addrF),
    // Underscore-prefixed upstream: no gate reads it. Its presence in the
    // public-input set IS the binding, because UltraHonk absorbs every public
    // input into the transcript.
    _acct_f: fieldIn(account),
  };
  return { inputs, payload: { y: keys.Y, pvk: keys.PVK } };
}
