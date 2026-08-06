/**
 * Selective-disclosure tests — OFFLINE, MOCKED bb.js backend. No real proof or
 * verification-key derivation runs: `Noir.execute` is stubbed and the
 * UltraHonkBackend is injected via `setUltraHonkBackendLoader`. What IS exercised
 * for real: the disclosure witness/ciphertext crypto (Grumpkin, Poseidon2) in
 * the round-trip helper, the prove/verify orchestration, and the §5.5 VK pin.
 *
 * Mirrors the demo's own `packages/sdk/test/disclosure.mjs` for the round-trip
 * (transfer witness → disclosure witness → decrypt) but with a mocked prover.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Noir } from "@noir-lang/noir_js";
import type { CompiledCircuit } from "@noir-lang/noir_js";

import { CircuitProver, setUltraHonkBackendLoader, type ProofResult } from "../proving/prover.js";
import { deriveKeys } from "../crypto/keys.js";
import { randomScalar, toHex32, fromHex } from "../crypto/field.js";
import { G, scalarMul, pointCoords } from "../crypto/grumpkin.js";
import { buildTransferWitness } from "../witness/transfer.js";
import { buildDiscloseRecipientWitness } from "../witness/disclose-recipient.js";

import {
  proveDisclosure,
  proveRecipientDisclosure,
  DISCLOSE_RECIPIENT_CIRCUIT_ID,
  DISCLOSURE_CIRCUIT_IDS,
  type DisclosureEvent,
} from "./index.js";
import {
  generateRecipientKeys,
  newDisclosureRequest,
  recipientKeysFromSecret,
  decryptDisclosure,
  pointToJson,
  pointFromJson,
} from "./recipient.js";
import { verifyDisclosure, DisclosureVerifyError } from "./verify.js";

const ADDR_F = 0x0de1n;
const FAKE_CIRCUIT = { bytecode: "fake-acir" } as unknown as CompiledCircuit;
const FAKE_PROOF = new Uint8Array([0xaa, 0xbb, 0xcc]);
const PINNED_VK = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

/** Build a "chain" transfer event via a real transfer witness (as the demo does). */
function makeEvent(amount: bigint): {
  event: DisclosureEvent;
  holder: ReturnType<typeof deriveKeys>;
  sender: ReturnType<typeof deriveKeys>;
} {
  const sender = deriveKeys(randomScalar(), ADDR_F);
  const holder = deriveKeys(randomScalar(), ADDR_F); // event's `to`
  const tw = buildTransferWitness({
    keys: sender,
    v: 1000n,
    r: 0n,
    amount,
    pvkB: holder.PVK,
    kAudR: scalarMul(randomScalar(), G),
    kAudS: scalarMul(randomScalar(), G),
  });
  const event: DisclosureEvent = {
    ref: { ledger: 42, id: "evt-1", txHash: "0xdead" },
    from: "GSENDER",
    to: "GHOLDER",
    rE: tw.payload.rE,
    sigma: tw.payload.sigma,
    vTilde: tw.payload.vTilde,
  };
  return { event, holder, sender };
}

describe("disclosure round-trip helpers (real crypto, no proving)", () => {
  it("recipientKeysFromSecret is deterministic", () => {
    const rR = randomScalar();
    const a = recipientKeysFromSecret(rR);
    const b = recipientKeysFromSecret(rR);
    expect(a.pR).toEqual(b.pR);
    expect(a.rR).toBe(rR);
  });

  it("pointToJson / pointFromJson round-trip", () => {
    const p = scalarMul(randomScalar(), G);
    const back = pointFromJson(pointToJson(p));
    expect(pointCoords(back)).toEqual(pointCoords(p));
  });

  it("decryptDisclosure recovers the amount from a witness-built ciphertext", () => {
    const AMOUNT = 250n;
    const { event, holder } = makeEvent(AMOUNT);
    const receiver = generateRecipientKeys();
    const request = newDisclosureRequest(receiver);

    const w = buildDiscloseRecipientWitness({
      keys: holder,
      event: { rE: event.rE, sigma: event.sigma, vTilde: event.vTilde },
      pR: pointFromJson(request.pR),
      nu: fromHex(request.nu),
    });
    expect(w.vTx).toBe(AMOUNT);

    const amount = decryptDisclosure(receiver.rR, w.rDisc, w.vTildeDisc, fromHex(request.nu));
    expect(amount).toBe(AMOUNT);

    // A wrong recipient secret must not silently recover the amount.
    const wrong = decryptDisclosure(randomScalar(), w.rDisc, w.vTildeDisc, fromHex(request.nu));
    expect(wrong).not.toBe(AMOUNT);
  });
});

describe("proveDisclosure / verifyDisclosure — mocked backend", () => {
  const generateProof =
    vi.fn<(w: Uint8Array, o?: unknown) => Promise<ProofResult>>(async () => ({
      proof: FAKE_PROOF,
      publicInputs: [],
    }));
  const verifyProof = vi.fn<(r: ProofResult, o?: unknown) => Promise<boolean>>(async () => true);
  const getVerificationKey =
    vi.fn<(o?: unknown) => Promise<Uint8Array>>(async () => new Uint8Array(PINNED_VK));
  const destroy = vi.fn<() => Promise<void>>(async () => {});

  beforeEach(() => {
    generateProof.mockClear();
    verifyProof.mockClear();
    getVerificationKey.mockClear();
    getVerificationKey.mockImplementation(async () => new Uint8Array(PINNED_VK));
    verifyProof.mockImplementation(async () => true);

    class MockBackend {
      constructor(public readonly acir: string) {}
      generateProof = generateProof;
      verifyProof = verifyProof;
      getVerificationKey = getVerificationKey;
      destroy = destroy;
    }
    setUltraHonkBackendLoader(async () => MockBackend as never);
    vi.spyOn(Noir.prototype, "execute").mockResolvedValue({
      witness: new Uint8Array([7]),
      returnValue: null as never,
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("proveDisclosure (recipient) returns a DisclosureBundle of the right shape + circuit id", async () => {
    const { event, holder } = makeEvent(250n);
    const receiver = generateRecipientKeys();
    const request = newDisclosureRequest(receiver);

    const prover = new CircuitProver(FAKE_CIRCUIT);
    const bundle = await proveDisclosure({ keys: holder, event, request, prover });

    expect(bundle.circuitId).toBe(DISCLOSE_RECIPIENT_CIRCUIT_ID);
    expect(bundle).toMatchObject({
      circuitId: expect.any(String),
      refE: event.ref,
      proof: expect.stringMatching(/^0x[0-9a-f]+$/),
      rDisc: { x: expect.any(String), y: expect.any(String) },
      vTildeDisc: expect.any(String),
    });
    expect(generateProof).toHaveBeenCalledTimes(1);
    // Same result via the explicit role builder.
    const alt = await proveRecipientDisclosure({ keys: holder, event, request, prover });
    expect(alt.circuitId).toBe(DISCLOSE_RECIPIENT_CIRCUIT_ID);
  });

  it("verifyDisclosure selects the circuit by circuit_id and pins the VK (match → proceeds)", async () => {
    const AMOUNT = 777n;
    const { event, holder } = makeEvent(AMOUNT);
    const receiver = generateRecipientKeys();
    const request = newDisclosureRequest(receiver);

    const prover = new CircuitProver(FAKE_CIRCUIT);
    const bundle = await proveDisclosure({ keys: holder, event, request, prover });
    expect(DISCLOSURE_CIRCUIT_IDS).toContain(bundle.circuitId);

    const res = await verifyDisclosure(bundle, {
      addrF: ADDR_F,
      rE: event.rE,
      sigma: event.sigma,
      vTilde: event.vTilde,
      pvkA: holder.PVK,
      pinnedVk: new Uint8Array(PINNED_VK),
      request,
      keys: receiver,
      prover,
    });

    expect(res.ok).toBe(true);
    expect(res.amount).toBe(AMOUNT);
    expect(res.role).toBe("recipient");
    expect(getVerificationKey).toHaveBeenCalledWith({ keccak: true });
    expect(verifyProof).toHaveBeenCalledTimes(1);
  });

  it("verifyDisclosure THROWS DisclosureVerifyError when the pinned VK is altered by one byte", async () => {
    const { event, holder } = makeEvent(100n);
    const receiver = generateRecipientKeys();
    const request = newDisclosureRequest(receiver);

    const prover = new CircuitProver(FAKE_CIRCUIT);
    const bundle = await proveDisclosure({ keys: holder, event, request, prover });

    const altered = new Uint8Array(PINNED_VK);
    altered.set([(altered[0] ?? 0) ^ 0x01], 0); // one byte off

    await expect(
      verifyDisclosure(bundle, {
        addrF: ADDR_F,
        rE: event.rE,
        sigma: event.sigma,
        vTilde: event.vTilde,
        pvkA: holder.PVK,
        pinnedVk: altered,
        request,
        keys: receiver,
        prover,
      }),
    ).rejects.toBeInstanceOf(DisclosureVerifyError);

    // And the VK-derivation was actually consulted for the compare.
    expect(getVerificationKey).toHaveBeenCalled();
    // The proof itself was never verified — pinning fails first.
    expect(verifyProof).not.toHaveBeenCalled();
  });

  it("verifyDisclosure throws on an unknown circuit_id", async () => {
    const { event, holder } = makeEvent(1n);
    const receiver = generateRecipientKeys();
    const request = newDisclosureRequest(receiver);
    const prover = new CircuitProver(FAKE_CIRCUIT);
    const bundle = await proveDisclosure({ keys: holder, event, request, prover });

    const bad = { ...bundle, circuitId: "nope" as never };
    await expect(
      verifyDisclosure(bad, {
        addrF: ADDR_F,
        rE: event.rE,
        sigma: event.sigma,
        vTilde: event.vTilde,
        pvkA: holder.PVK,
        request,
        keys: receiver,
        prover,
      }),
    ).rejects.toBeInstanceOf(DisclosureVerifyError);
  });

  it("verifyDisclosure throws when the request key is not the verifier's own", async () => {
    const { event, holder } = makeEvent(1n);
    const receiver = generateRecipientKeys();
    const request = newDisclosureRequest(receiver);
    const prover = new CircuitProver(FAKE_CIRCUIT);
    const bundle = await proveDisclosure({ keys: holder, event, request, prover });

    await expect(
      verifyDisclosure(bundle, {
        addrF: ADDR_F,
        rE: event.rE,
        sigma: event.sigma,
        vTilde: event.vTilde,
        pvkA: holder.PVK,
        request,
        keys: generateRecipientKeys(), // different key than the request
        prover,
      }),
    ).rejects.toBeInstanceOf(DisclosureVerifyError);
  });

  it("verifyDisclosure surfaces a proof failure as a verify-proof error", async () => {
    const { event, holder } = makeEvent(5n);
    const receiver = generateRecipientKeys();
    const request = newDisclosureRequest(receiver);
    const prover = new CircuitProver(FAKE_CIRCUIT);
    const bundle = await proveDisclosure({ keys: holder, event, request, prover });

    verifyProof.mockImplementation(async () => false);

    await expect(
      verifyDisclosure(bundle, {
        addrF: ADDR_F,
        rE: event.rE,
        sigma: event.sigma,
        vTilde: event.vTilde,
        pvkA: holder.PVK,
        pinnedVk: new Uint8Array(PINNED_VK),
        request,
        keys: receiver,
        prover,
      }),
    ).rejects.toMatchObject({ stage: "verify-proof" });
  });
});

describe("loadDisclosureVk (node-only pinned VK)", () => {
  it("decodes the vendored disclose_recipient.vk.json to raw bytes", async () => {
    const { loadDisclosureVk } = await import("../proving/artifacts.js");
    const vk = loadDisclosureVk("disclose_recipient");
    expect(vk).toBeInstanceOf(Uint8Array);
    expect(vk.length).toBeGreaterThan(1000);
  });
});

/**
 * The circuit, actually executed — the guard that was missing.
 *
 * Every test above stubs `Noir.execute`, so the client's arithmetic is checked
 * only against itself. That is how `DOMAIN.DISCLOSURE` was moved off the value
 * the compiled circuits absorb and shipped in 0.1.3 and 0.1.5 with nothing
 * failing: a mocked prover agrees with whatever it is handed.
 *
 * This executes the real ACIR against a witness the SDK built. The U-block
 * constrains `v_tilde_disc = v_tx + Poseidon2(delta_disc, S_disc.x, nu)`, so if
 * the client's tag and the circuit's global ever diverge again, the constraint
 * is unsatisfiable and this fails here rather than in someone's wallet.
 */
describe("disclose_recipient — real circuit execution (no mock)", () => {
  const load = async () => (await import("../proving/artifacts.js")).loadCircuit("disclose_recipient" as never);

  it("executes the compiled circuit against an SDK-built witness", async () => {
    const { event, holder } = makeEvent(250n);
    const rk = generateRecipientKeys();
    const w = buildDiscloseRecipientWitness({
      keys: holder, event, pR: pointFromJson(rk.pR), nu: randomScalar(),
    });
    expect(w.vTx).toBe(250n);
    await expect(new Noir(await load()).execute(w.inputs as never)).resolves.toBeDefined();
  }, 120_000);

  it("is not vacuous — an amount sealed under the old tag is rejected", async () => {
    const { DOMAIN } = await import("../crypto/constants.js");
    const { poseidonWithDomain } = await import("../crypto/poseidon2.js");
    const { frMod } = await import("../crypto/field.js");
    const { ecdh } = await import("../crypto/grumpkin.js");

    const { event, holder } = makeEvent(250n);
    const rk = generateRecipientKeys();
    const nu = randomScalar();
    const rDiscScalar = randomScalar();
    const w = buildDiscloseRecipientWitness({
      keys: holder, event, pR: pointFromJson(rk.pR), nu, rDisc: rDiscScalar,
    });

    // Re-seal under 13 — what this client used before the tag was corrected.
    const sDiscX = ecdh(rDiscScalar, pointFromJson(rk.pR));
    const stale = frMod(w.vTx + poseidonWithDomain(13n, [sDiscX, nu]));
    expect(DOMAIN.DISCLOSURE).toBe(16n);
    expect(stale).not.toBe(w.vTildeDisc);

    const bad = { ...w.inputs, v_tilde_disc: toHex32(stale) };
    await expect(new Noir(await load()).execute(bad as never)).rejects.toThrow();
  }, 120_000);
});
