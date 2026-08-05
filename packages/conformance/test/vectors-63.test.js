/**
 * SDK.md §6.3 — the vectors the specification requires and does not supply.
 *
 * These are read from `vectors/` exactly the way §6.1's are read from
 * `fixtures/`: the file is the contract, the code reproduces it. Generating
 * them and then testing against the generator would prove nothing — the
 * committed file has to be the thing under test, because that is what would be
 * contributed upstream and what another language would implement against.
 *
 * Regenerate with: node scripts/generate-63-vectors.mjs
 * The files must not change when it is re-run; if they do, the derivation is
 * not deterministic, which is the one property they exist to guarantee.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Keypair } from "@stellar/stellar-sdk";
import {
  deriveEphemeralRE,
  deriveKeys,
  deriveSk,
  addressToField,
  pointCoords,
  skSigningMessage,
  skSigningPayload,
  SK_DOMAIN,
  SEP53_PREFIX,
} from "stellar-confidential-token-sdk";

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(readFileSync(join(HERE, "..", "vectors", `${name}.json`), "utf8"));

const hex = (n) => `0x${n.toString(16).padStart(64, "0")}`;
const hexBytes = (u8) => `0x${Buffer.from(u8).toString("hex")}`;

describe("§6.3 · δ_eph", () => {
  const doc = load("delta_eph");

  it("carries vectors", () => {
    expect(doc.vectors.length).toBeGreaterThan(0);
  });

  doc.vectors.forEach((v, i) => {
    it(`vector ${i} reproduces r_e exactly`, () => {
      expect(hex(deriveEphemeralRE(BigInt(v.inputs.vk), BigInt(v.inputs.sigma)))).toBe(
        v.output,
      );
    });
  });

  it("distinct sigmas give distinct scalars", () => {
    // If they collided, reusing sigma would reuse the ephemeral key, and the
    // ECDH shared secret with it.
    const outs = new Set(doc.vectors.map((v) => v.output));
    expect(outs.size).toBe(doc.vectors.length);
  });

  it("no output is zero — the circuit constrains r_e != 0", () => {
    for (const v of doc.vectors) expect(BigInt(v.output)).not.toBe(0n);
  });
});

describe("§6.3 · the §5.1 derivation chain", () => {
  const doc = load("sk_derivation_chain");
  const v = doc.vectors[0];
  const { inputs, intermediate, output } = v;

  const keypair = Keypair.fromRawEd25519Seed(
    Buffer.from(inputs.ed25519_seed.replace(/^0x/, ""), "hex"),
  );

  it("the published seed yields the published account", () => {
    expect(keypair.publicKey()).toBe(inputs.account);
  });

  it("reproduces the SEP-0053 signed message", () => {
    const msg = skSigningMessage(inputs.contract, inputs.account);
    expect(hexBytes(msg)).toBe(intermediate.signed_message_hex);
    expect(new TextDecoder().decode(msg)).toBe(intermediate.signed_message_utf8);
    // The message is the domain, then the two addresses, newline-separated.
    expect(intermediate.signed_message_utf8).toBe(
      `${SK_DOMAIN}\n${inputs.contract}\n${inputs.account}`,
    );
  });

  it("reproduces the SEP-0053 payload the signer actually signs", () => {
    expect(SEP53_PREFIX).toBe(intermediate.sep53_prefix);
    expect(hexBytes(skSigningPayload(inputs.contract, inputs.account))).toBe(
      intermediate.sep53_payload_sha256,
    );
  });

  it("reproduces the root signature bit-for-bit", () => {
    // ed25519 is deterministic, so the root is reproducible by anyone holding
    // the published seed — which is what makes this a usable cross-language
    // vector rather than a snapshot of one run.
    const root = new Uint8Array(
      keypair.sign(Buffer.from(skSigningPayload(inputs.contract, inputs.account))),
    );
    expect(hexBytes(root)).toBe(intermediate.root_signature);
  });

  it("reproduces addr_f and acct_f", () => {
    expect(hex(addressToField(inputs.contract))).toBe(intermediate.addr_f);
    expect(hex(addressToField(inputs.account))).toBe(intermediate.acct_f);
  });

  it("reproduces sk, vk, Y and PVK from the root", () => {
    const root = new Uint8Array(
      keypair.sign(Buffer.from(skSigningPayload(inputs.contract, inputs.account))),
    );
    const derived = deriveSk(root, inputs.contract, inputs.account);
    const keys = deriveKeys(derived.sk, derived.addrF);
    const Y = pointCoords(keys.Y);
    const PVK = pointCoords(keys.PVK);

    expect(hex(derived.sk)).toBe(output.sk);
    expect(hex(derived.vk)).toBe(output.vk);
    expect({ x: hex(Y.x), y: hex(Y.y) }).toEqual(output.Y);
    expect({ x: hex(PVK.x), y: hex(PVK.y) }).toEqual(output.PVK);
  });

  it("pins the rejection counter, because it is an OUTPUT", () => {
    // j is not chosen by the caller: it is where the rejection procedure landed.
    // A client that samples candidates differently reaches a different j and so
    // a different sk from the same root, which is why the fixture records it.
    const root = new Uint8Array(
      keypair.sign(Buffer.from(skSigningPayload(inputs.contract, inputs.account))),
    );
    expect(deriveSk(root, inputs.contract, inputs.account).j).toBe(
      intermediate.rejection_counter_j,
    );
  });

  it("the whole chain is deterministic across independent runs", () => {
    const run = () => {
      const root = new Uint8Array(
        keypair.sign(Buffer.from(skSigningPayload(inputs.contract, inputs.account))),
      );
      return deriveSk(root, inputs.contract, inputs.account).sk;
    };
    expect(run()).toBe(run());
  });
});
