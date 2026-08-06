/**
 * UltraHonk proving wrapper (bb.js) with a keccak transcript.
 *
 * `KECCAK = { keccak: true }` is MANDATORY on every bb.js call (`generateProof`,
 * `verifyProof`, `getVerificationKey`): the on-chain UltraHonk verifier squeezes
 * challenges with keccak, and a Poseidon transcript silently produces a proof
 * that fails verification on-chain. This flag is load-bearing, do not drop it.
 *
 * The bb.js backend is obtained through a pluggable async loader so a browser
 * build (Z5) can inject a vendored WASM path via {@link setUltraHonkBackendLoader}
 * without pulling the default `@aztec/bb.js` entry into the bundle.
 */

import { Noir } from "@noir-lang/noir_js";
import type { CompiledCircuit } from "@noir-lang/noir_js";

/** The keccak-transcript flag, required on every bb.js proving/verifying call. */
export const KECCAK = { keccak: true } as const;

/** A generated proof plus its public inputs, as returned by bb.js. */
export interface ProofResult {
  proof: Uint8Array;
  publicInputs: string[];
}

/** Minimal structural type of the bb.js `UltraHonkBackend` we depend on. */
interface UltraHonkBackendLike {
  generateProof(witness: Uint8Array, options?: typeof KECCAK): Promise<ProofResult>;
  verifyProof(result: ProofResult, options?: typeof KECCAK): Promise<boolean>;
  getVerificationKey(options?: typeof KECCAK): Promise<Uint8Array>;
  destroy(): Promise<void>;
}

/** Constructor shape for the backend (built from a circuit's ACIR bytecode). */
type UltraHonkBackendCtor = new (acirBytecode: string) => UltraHonkBackendLike;

/** An async loader that resolves the `UltraHonkBackend` constructor. */
export type UltraHonkBackendLoader = () => Promise<UltraHonkBackendCtor>;

/** Default loader: dynamic-import the node/bundler entry of `@aztec/bb.js`. */
let backendLoader: UltraHonkBackendLoader = async () =>
  (await import("@aztec/bb.js")).UltraHonkBackend as unknown as UltraHonkBackendCtor;

/**
 * Override how the `UltraHonkBackend` constructor is resolved. The browser (Z5)
 * injects a vendored bb.js path here; tests inject a mock to assert the keccak
 * flag without running the real prover.
 */
export function setUltraHonkBackendLoader(loader: UltraHonkBackendLoader): void {
  backendLoader = loader;
}

/**
 * Wraps a single compiled Noir circuit: solves its witness via `noir_js`, then
 * proves/verifies it via a lazily-constructed UltraHonk backend.
 */
export class CircuitProver {
  readonly #noir: Noir;
  readonly #bytecode: string;
  #backend: UltraHonkBackendLike | undefined;

  constructor(circuit: CompiledCircuit) {
    this.#noir = new Noir(circuit);
    this.#bytecode = circuit.bytecode;
  }

  async #backendReady(): Promise<UltraHonkBackendLike> {
    if (!this.#backend) {
      const Backend = await backendLoader();
      this.#backend = new Backend(this.#bytecode);
    }
    return this.#backend;
  }

  /** Solve the witness for `inputs`, then generate a keccak-transcript proof. */
  async prove(inputs: Parameters<Noir["execute"]>[0]): Promise<ProofResult> {
    const { witness } = await this.#noir.execute(inputs);
    const backend = await this.#backendReady();
    return backend.generateProof(witness, KECCAK);
  }

  /** Verify a previously-generated proof (keccak transcript). */
  async verify(result: ProofResult): Promise<boolean> {
    const backend = await this.#backendReady();
    return backend.verifyProof(result, KECCAK);
  }

  /** Fetch the circuit's verification key (keccak transcript). */
  async verificationKey(): Promise<Uint8Array> {
    const backend = await this.#backendReady();
    return backend.getVerificationKey(KECCAK);
  }

  /** Release the underlying bb.js backend resources. */
  async destroy(): Promise<void> {
    if (this.#backend) {
      await this.#backend.destroy();
      this.#backend = undefined;
    }
  }
}

/** Convenience: build a {@link CircuitProver} directly from a compiled circuit. */
export function proverFromArtifact(circuit: CompiledCircuit): CircuitProver {
  return new CircuitProver(circuit);
}
