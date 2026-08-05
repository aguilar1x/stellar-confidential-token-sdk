/**
 * SDK.md §6.1 — every primitive, byte-for-byte, against OpenZeppelin's own
 * published vectors.
 *
 * Cases are generated from the fixture files, not written by hand. Two
 * properties follow from that and both are deliberate:
 *
 *   - a vector added upstream becomes a case here with no code change;
 *   - a fixture file that goes missing or empty FAILS, rather than quietly
 *     reducing the suite to nothing. A conformance suite that passes because it
 *     tested nothing is worse than no suite, since it produces a green badge
 *     that means the opposite of what a reader assumes.
 */

import { describe, expect, it } from "vitest";

import {
  addressToField,
  commit,
  scalarMul,
  ecdh,
  pointCoords,
  H,
  poseidonWithDomain,
  spongeSqueeze2,
  vkFromSk,
  dvkFromVkOp,
  deriveSpendR,
  deriveAllowR,
  deriveTxBlind,
  encryptAmount,
  encryptBalance,
  encryptAllowance,
  encryptEscDvk,
  encryptAuditorSenderBalance,
} from "stellar-confidential-token-sdk";

import { loadFixtures, canonical, hex32 } from "../src/fixtures.js";
import { KNOWN_DIVERGENCES, DOMAIN_COLLISIONS } from "../src/divergences.js";

const f = (v) => BigInt(v);

/** Named points the fixtures refer to symbolically. */
const POINTS = { H };

function resolvePoint(name) {
  const p = POINTS[name];
  if (!p) throw new Error(`fixture refers to unknown point "${name}"`);
  return p;
}

const asPoint = (p) => {
  const { x, y } = pointCoords(p);
  return { x: hex32(x), y: hex32(y) };
};

/**
 * One evaluator per primitive. Each takes a fixture vector's `inputs` and
 * returns the value in canonical form, so the comparison below is uniform.
 */
const PRIMITIVES = {
  address_to_field: (i) => hex32(addressToField(i.strkey)),

  poseidon_with_domain: (i) => hex32(poseidonWithDomain(f(i.domain), i.inputs.map(f))),

  sponge_squeeze_2: (i) => spongeSqueeze2(f(i.d), f(i.s), f(i.sigma)).map(hex32),

  commit: (i) => asPoint(commit(f(i.value), f(i.randomness))),

  scalar_mul: (i) => asPoint(scalarMul(f(i.scalar), resolvePoint(i.point))),

  // PVK is the viewing key taken to the H generator.
  pvk_from_vk: (i) => asPoint(scalarMul(f(i.vk), H)),

  ecdh: (i) => hex32(ecdh(f(i.scalar), resolvePoint(i.point))),

  vk_from_sk: (i) => hex32(vkFromSk(f(i.sk), f(i.wrap))),

  dvk_from_vk_op: (i) => hex32(dvkFromVkOp(f(i.vk), f(i.op_i))),

  derive_spend_r: (i) => hex32(deriveSpendR(f(i.vk), f(i.sigma))),

  derive_allow_r: (i) => hex32(deriveAllowR(f(i.dvk), f(i.sigma_a))),

  derive_transfer_blind: (i) => hex32(deriveTxBlind(f(i.s), f(i.sigma))),

  encrypt_amount: (i) => hex32(encryptAmount(f(i.v_transfer), f(i.s), f(i.sigma))),

  encrypt_balance: (i) => hex32(encryptBalance(f(i.v_new), f(i.vk), f(i.sigma))),

  encrypt_allowance: (i) => hex32(encryptAllowance(f(i.v_a), f(i.dvk), f(i.sigma_a))),

  encrypt_esc_dvk: (i) => hex32(encryptEscDvk(f(i.dvk), f(i.s), f(i.op_i))),

  encrypt_auditor_sender_balance: (i) =>
    hex32(encryptAuditorSenderBalance(f(i.v_new), f(i.s_a_s), f(i.sigma))),
};

const fixtures = loadFixtures();

describe("§6.1 · the suite itself must be non-vacuous", () => {
  it("found the vendored fixture files", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it("covers every fixture — an unmapped primitive is a conformance GAP", () => {
    // Silently skipping an unknown primitive would let the badge stay green
    // while coverage quietly shrank. Naming the gap is the whole point.
    const unmapped = fixtures.map((x) => x.name).filter((n) => !PRIMITIVES[n]);
    expect(unmapped, `no evaluator for: ${unmapped.join(", ")}`).toEqual([]);
  });

  it("every fixture carries at least one vector", () => {
    for (const { name, doc } of fixtures) {
      expect(Array.isArray(doc.vectors), `${name} has no vectors array`).toBe(true);
      expect(doc.vectors.length, `${name} has zero vectors`).toBeGreaterThan(0);
    }
  });
});

const conforming = fixtures.filter((x) => !KNOWN_DIVERGENCES[x.name]);
const diverging = fixtures.filter((x) => KNOWN_DIVERGENCES[x.name]);

describe("§6.1 · byte-for-byte reproduction", () => {
  for (const { name, doc } of conforming) {
    describe(name, () => {
      doc.vectors.forEach((vector, i) => {
        it(`vector ${i} reproduces exactly`, () => {
          const actual = PRIMITIVES[name](vector.inputs);
          expect(actual).toEqual(canonical(vector.output));
        });
      });
    });
  }
});

describe("§6.1 · known divergences, pinned from both sides", () => {
  // These do NOT conform, and the suite says so out loud. Each is pinned by
  // both the spec's value and ours, so it fails if either moves — including if
  // they converge, which would mean the divergence should be deleted rather
  // than left standing as a stale excuse.
  for (const { name, doc } of diverging) {
    const d = KNOWN_DIVERGENCES[name];

    describe(name, () => {
      it("still diverges — and from exactly the documented value", () => {
        const actual = PRIMITIVES[name](doc.vectors[0].inputs);
        const expected = canonical(doc.vectors[0].output);

        expect(expected, "the spec's fixture changed; re-review this divergence").toEqual(
          d.expected,
        );
        expect(actual, "our value changed; re-review this divergence").toEqual(d.actual);
        expect(
          actual,
          `${name} now MATCHES the spec — delete this divergence and move it to the conforming set`,
        ).not.toEqual(expected);
      });

      it("documents why it cannot simply be fixed", () => {
        expect(d.specSays).toBeTruthy();
        expect(d.weDo).toBeTruthy();
        expect(d.whyItMatters).toBeTruthy();
        expect(d.blockedBy).toBeTruthy();
      });
    });
  }

  it("the divergence list is exhaustive — nothing else silently fails", () => {
    // Guards against a future divergence being absorbed unnoticed: every
    // fixture is either conforming or explicitly listed, never neither.
    const unexpected = [];
    for (const { name, doc } of conforming) {
      for (const vector of doc.vectors) {
        if (JSON.stringify(PRIMITIVES[name](vector.inputs)) !== JSON.stringify(canonical(vector.output))) {
          unexpected.push(name);
        }
      }
    }
    expect(unexpected, `undocumented divergence in: ${unexpected.join(", ")}`).toEqual([]);
  });
});

describe("§4.8 · domain separation", () => {
  for (const c of DOMAIN_COLLISIONS) {
    it(`tag ${c.tag} is claimed by both ${c.specUses.split(" ")[0]} and ${c.weUse}`, () => {
      // Recovered, not assumed: only domain 13 reproduces the ecdh vector, so
      // the collision is a fact about the fixtures rather than a reading of a
      // table we might have misinterpreted.
      const { inputs, output } = fixtures.find((x) => x.name === "ecdh").doc.vectors[0];
      const S = scalarMul(BigInt(inputs.scalar), resolvePoint(inputs.point));
      const { x, y } = pointCoords(S);
      expect(hex32(poseidonWithDomain(BigInt(c.tag), [x, y]))).toBe(hex32(output));
    });
  }
});

describe("§6.1 · the comparison is genuinely byte-for-byte", () => {
  it("a value that differs in one bit fails", () => {
    // Guards the guard: if canonicalization were lossy, everything above would
    // pass vacuously.
    const vk = vkFromSk(0xdeadn, 0xbeefn);
    expect(hex32(vk)).not.toEqual(hex32(vk + 1n));
  });

  it("padding is normalized, so a short hex still compares equal", () => {
    expect(hex32("0x0a")).toBe(hex32("0xa"));
    expect(hex32("0xa")).toHaveLength(66);
  });
});
