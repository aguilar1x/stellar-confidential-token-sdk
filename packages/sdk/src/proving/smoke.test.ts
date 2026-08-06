/**
 * Real end-to-end proving smoke (Z2.13). ONE non-mocked UltraHonk proof over the
 * vendored `register` circuit, proving the whole pipeline, witness build →
 * bb.js WASM proof (keccak transcript) → self-verify, works on-chain-compatibly.
 *
 * This is intentionally slow: bb.js loads WASM and may fetch a structured
 * reference string on the first proof. Hence the 120s timeout. It runs in the
 * default `npm run test` pass; there is no mock here.
 */

import { describe, expect, it } from "vitest";

import { CircuitProver } from "./prover.js";
import { loadCircuit } from "./artifacts.js";
import { deriveKeys } from "../crypto/keys.js";
import { buildRegisterWitness } from "../witness/register.js";

// Deterministic account so the proof is reproducible run-to-run.
const ADDR_F = 0x2222n;
const SK = 0x1234_5678_9abc_deffn;

describe("real proving smoke (register)", () => {
  it(
    "generates and self-verifies a real UltraHonk proof",
    async () => {
/** Any field element: no gate reads acct_f, its presence is the binding. */
const ACCT_F = 0x00ac_c700_0000_0001n;
      const keys = deriveKeys(SK, ADDR_F, ACCT_F);
      const witness = buildRegisterWitness(keys);

      const prover = new CircuitProver(loadCircuit("register"));
      try {
        const result = await prover.prove(witness.inputs);

        expect(result.proof).toBeInstanceOf(Uint8Array);
        expect(result.proof.length).toBeGreaterThan(0);
        expect(Array.isArray(result.publicInputs)).toBe(true);

        // The proof self-verifies under the keccak transcript.
        expect(await prover.verify(result)).toBe(true);
      } finally {
        await prover.destroy();
      }
    },
    120_000,
  );
});
