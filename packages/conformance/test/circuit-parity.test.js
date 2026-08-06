/**
 * SDK.md §6.2 — circuit-execution parity.
 *
 * The spec asks for two things per supported circuit: build witnesses from the
 * crypto core and execute the REAL compiled circuit asserting success, and
 * include tamper cases with perturbed values asserting rejection.
 *
 * The tamper half is what gives the first half meaning. A circuit that accepted
 * everything would pass the success cases perfectly, so the suite is only
 * evidence of anything if it also demonstrates the circuit saying no.
 *
 * These run the real UltraHonk prover over the vendored artifacts. That is slow
 * by nature — the timeouts are generous rather than optimistic.
 */

import { describe, expect, it } from "vitest";

import {
  CircuitProver,
  deriveKeys,
  deriveSk,
  H,
  scalarMul,
  buildRegisterWitness,
  buildTransferWitness,
  buildWithdrawWitness,
  addressToField,
} from "stellar-confidential-token-sdk";
import { loadCircuit } from "stellar-confidential-token-sdk/node";

const TIMEOUT = 240_000;

const CONTRACT = "CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const SENDER = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
const RECIPIENT = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const ROOT = new Uint8Array(64).map((_, i) => (i * 7 + 13) & 0xff);

/** Keys derived through §5.1, so parity is checked on realistic inputs. */
const alice = (() => {
  const { sk, addrF } = deriveSk(ROOT, CONTRACT, SENDER);
  return { keys: deriveKeys(sk, addrF, addressToField(SENDER)), addrF };
})();
const bob = (() => {
  const { sk } = deriveSk(ROOT, CONTRACT, RECIPIENT);
  return deriveKeys(sk, alice.addrF);
})();
const kAud = scalarMul(0xabcdefn, H);

function witnesses() {
  return {
    register: buildRegisterWitness(alice.keys),
    transfer: buildTransferWitness({
      keys: alice.keys,
      v: 2500n,
      r: 4242n,
      amount: 750n,
      pvkB: bob.PVK,
      kAudR: kAud,
      kAudS: kAud,
    }),
    withdraw: buildWithdrawWitness({
      keys: alice.keys,
      v: 2500n,
      r: 4242n,
      amount: 500n,
      kAudS: kAud,
    }),
  };
}

/** Prove `inputs` against `circuit`; return whether the proof verifies. */
async function proves(circuit, inputs) {
  const prover = new CircuitProver(loadCircuit(circuit));
  try {
    const result = await prover.prove(inputs);
    return await prover.verify(result);
  } finally {
    await prover.destroy();
  }
}

/** Errors that mean the CONSTRAINT SYSTEM refused, as opposed to a broken test. */
const CONSTRAINT_FAILURE = /cannot satisfy constraint|constraint.*fail|assert|unsatisfied/i;

/**
 * A tampered witness must not yield a verifying proof — and must fail for the
 * RIGHT reason.
 *
 * Catching every exception would be the classic false positive here: a typo in
 * the harness throws a TypeError, the helper reports "rejected", and the suite
 * goes green having tested nothing. So a thrown error only counts when it is
 * recognisably the circuit refusing; anything else is re-thrown and fails the
 * test loudly.
 */
async function rejects(circuit, inputs) {
  try {
    return (await proves(circuit, inputs)) === false;
  } catch (e) {
    const message = String(e?.message ?? e);
    if (CONSTRAINT_FAILURE.test(message)) return true;
    throw new Error(`tamper failed for an unexpected reason, not a constraint: ${message}`);
  }
}

describe("§6.2 · the real circuits accept honest witnesses", () => {
  const built = witnesses();

  for (const name of ["register", "transfer", "withdraw"]) {
    it(
      `${name} executes and self-verifies`,
      async () => {
        expect(await proves(name, built[name].inputs)).toBe(true);
      },
      TIMEOUT,
    );
  }
});

describe("§6.2 · tamper cases — the circuits reject perturbed witnesses", () => {
  const built = witnesses();

  /**
   * Perturb one field of a witness by one. A single unit is the strongest form
   * of the test: it shows the constraint is exact rather than approximate, and
   * it cannot be dismissed as obviously malformed input.
   */
  function nudge(inputs, key) {
    const copy = structuredClone(inputs);
    const current = copy[key];
    expect(current, `witness has no field "${key}"`).toBeDefined();
    if (typeof current === "string") {
      copy[key] = `0x${(BigInt(current) + 1n).toString(16)}`;
    } else {
      copy[key] = String(BigInt(current) + 1n);
    }
    return copy;
  }

  const cases = [
    { circuit: "register", field: "sk", why: "a spending key that does not match the published Y" },
    { circuit: "transfer", field: "v", why: "a pre-transfer balance that does not open C_spend" },
    { circuit: "transfer", field: "r", why: "a blinding that does not open C_spend" },
    { circuit: "transfer", field: "v_transfer", why: "an amount inconsistent with C_transfer" },
    { circuit: "withdraw", field: "v", why: "a balance that does not open the commitment" },
  ];

  for (const { circuit, field, why } of cases) {
    it(
      `${circuit}: rejects ${field} off by one — ${why}`,
      async () => {
        const tampered = nudge(built[circuit].inputs, field);
        expect(await rejects(circuit, tampered)).toBe(true);
      },
      TIMEOUT,
    );
  }

  it(
    "the tamper harness is not vacuous — the untampered witness still passes",
    async () => {
      // Without this, every rejection above could be an artefact of a broken
      // harness rather than a working constraint system.
      expect(await proves("transfer", built.transfer.inputs)).toBe(true);
    },
    TIMEOUT,
  );
});
