import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Noir } from "@noir-lang/noir_js";
import type { CompiledCircuit } from "@noir-lang/noir_js";

import {
  CircuitProver,
  KECCAK,
  setUltraHonkBackendLoader,
  type ProofResult,
} from "./prover.js";
import { loadCircuit } from "./artifacts.js";
import { deriveKeys } from "../crypto/keys.js";
import { buildRegisterWitness } from "../witness/register.js";
import { buildTransferWitness } from "../witness/transfer.js";
import { H, scalarMul } from "../crypto/grumpkin.js";

/** A structurally-valid-enough compiled circuit; `execute` is stubbed so the
 *  real ACIR is never solved. */
const FAKE_CIRCUIT = { bytecode: "fake-acir" } as unknown as CompiledCircuit;

/** Deterministic proof result the mock backend returns. */
const FAKE_RESULT: ProofResult = { proof: new Uint8Array([1, 2, 3]), publicInputs: ["0x01"] };

describe("CircuitProver, keccak transcript", () => {
  const generateProof =
    vi.fn<(witness: Uint8Array, options?: unknown) => Promise<ProofResult>>(async () => FAKE_RESULT);
  const verifyProof =
    vi.fn<(result: ProofResult, options?: unknown) => Promise<boolean>>(async () => true);
  const getVerificationKey =
    vi.fn<(options?: unknown) => Promise<Uint8Array>>(async () => new Uint8Array([9]));
  const destroy = vi.fn<() => Promise<void>>(async () => {});

  beforeEach(() => {
    generateProof.mockClear();
    verifyProof.mockClear();
    getVerificationKey.mockClear();
    destroy.mockClear();

    // Inject a mock UltraHonkBackend constructor.
    class MockBackend {
      constructor(public readonly acir: string) {}
      generateProof = generateProof;
      verifyProof = verifyProof;
      getVerificationKey = getVerificationKey;
      destroy = destroy;
    }
    setUltraHonkBackendLoader(async () => MockBackend as never);

    // Stub witness solving so no real ACIR is executed.
    vi.spyOn(Noir.prototype, "execute").mockResolvedValue({
      witness: new Uint8Array([7, 7, 7]),
      returnValue: null as never,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes { keccak: true } to generateProof, verifyProof and getVerificationKey", async () => {
    const prover = new CircuitProver(FAKE_CIRCUIT);

    const result = await prover.prove({ a: "0x1" });
    await prover.verify(result);
    await prover.verificationKey();
    await prover.destroy();

    expect(generateProof).toHaveBeenCalledTimes(1);
    expect(generateProof.mock.calls[0]![1]).toEqual({ keccak: true });

    expect(verifyProof).toHaveBeenCalledTimes(1);
    expect(verifyProof.mock.calls[0]![1]).toEqual({ keccak: true });

    expect(getVerificationKey).toHaveBeenCalledTimes(1);
    expect(getVerificationKey.mock.calls[0]![0]).toEqual({ keccak: true });

    // The exported constant is exactly the keccak flag.
    expect(KECCAK).toEqual({ keccak: true });
  });
});

describe("witness Noir-input key sets", () => {
  const ADDR_F = 0x2222n;
  const SK = 0x1234_5678_9abc_deffn;
/** Any field element: no gate reads acct_f, its presence is the binding. */
const ACCT_F = 0x00ac_c700_0000_0001n;
  const keys = deriveKeys(SK, ADDR_F, ACCT_F);

  it("register witness has EXACTLY 7 keys", () => {
    const { inputs } = buildRegisterWitness(keys);
    expect(new Set(Object.keys(inputs))).toEqual(
      new Set(["sk", "y_x", "y_y", "pvk_x", "pvk_y", "addr_f", "_acct_f"]),
    );
  });

  it("transfer witness has EXACTLY the 29 keys", () => {
    const recipient = deriveKeys(0xbeefn, ADDR_F);
    const kAudR = scalarMul(0x3n, H);
    const kAudS = scalarMul(0x5n, H);
    const { inputs } = buildTransferWitness({
      keys,
      v: 100n,
      r: 7n,
      amount: 40n,
      pvkB: recipient.PVK,
      kAudR,
      kAudS,
      sigma: 0x11n,
      rE: 0x13n,
    });
    expect(new Set(Object.keys(inputs))).toEqual(
      new Set([
        "sk", "v", "r", "v_transfer", "r_e",
        "c_spend_x", "c_spend_y",
        "y_x", "y_y",
        "pvk_b_x", "pvk_b_y",
        "addr_f",
        "k_aud_r_x", "k_aud_r_y",
        "k_aud_s_x", "k_aud_s_y",
        "c_spend_new_x", "c_spend_new_y",
        "c_transfer_x", "c_transfer_y",
        "r_e_x", "r_e_y",
        "v_tilde", "b_tilde", "sigma",
        "v_tilde_aud_r", "r_tilde_aud_r",
        "v_tilde_aud_s", "b_tilde_aud_s",
      ]),
    );
    expect(Object.keys(inputs)).toHaveLength(29);
  });
});

describe("artifacts loadCircuit", () => {
  it("loads register circuit with a bytecode string", () => {
    const circuit = loadCircuit("register");
    expect(typeof circuit.bytecode).toBe("string");
    expect(circuit.bytecode.length).toBeGreaterThan(0);
  });
});
