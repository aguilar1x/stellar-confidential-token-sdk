/**
 * End-to-end check that a §5.1-derived secret is not merely well-typed but
 * actually usable: it must drive the REAL register circuit to a proof that
 * self-verifies, and a transfer from that account must do the same.
 *
 * Without this, "conformant derivation" would be an untested claim, the
 * derived `sk` could be structurally valid yet land outside whatever range the
 * circuit constrains.
 */

import { describe, expect, it } from "vitest";

import { CircuitProver } from "./prover.js";
import { loadCircuit } from "./artifacts.js";
import { deriveKeys } from "../crypto/keys.js";
import { deriveSk } from "../crypto/sk-derivation.js";
import { addressToField } from "../crypto/address.js";
import { buildRegisterWitness } from "../witness/register.js";
import { buildTransferWitness } from "../witness/transfer.js";
import { H, scalarMul } from "../crypto/grumpkin.js";

const CONTRACT = "CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const ACCOUNT = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
const RECIPIENT = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

const ROOT = new Uint8Array(64).map((_, i) => (i * 7 + 13) & 0xff);

describe("§5.1 derived secret drives the real circuits", () => {
  it(
    "registers with a spec-derived sk and self-verifies",
    async () => {
      const { sk, addrF, vk } = deriveSk(ROOT, CONTRACT, ACCOUNT);
      const keys = deriveKeys(sk, addrF, addressToField(ACCOUNT));

      // The standalone derivation and the existing key schedule must agree.
      expect(keys.vk).toBe(vk);

      const prover = new CircuitProver(loadCircuit("register"));
      try {
        const result = await prover.prove(buildRegisterWitness(keys).inputs);
        expect(await prover.verify(result)).toBe(true);
      } finally {
        await prover.destroy();
      }
    },
    180_000,
  );

  it(
    "transfers between two spec-derived accounts and self-verifies",
    async () => {
      const a = deriveSk(ROOT, CONTRACT, ACCOUNT);
      const b = deriveSk(ROOT, CONTRACT, RECIPIENT);
      const keysA = deriveKeys(a.sk, a.addrF);

      const witness = buildTransferWitness({
        keys: keysA,
        v: 2500n,
        r: 4242n,
        amount: 750n,
        pvkB: scalarMul(b.vk, H),
        kAudR: scalarMul(99n, H),
        kAudS: scalarMul(99n, H),
      });
      expect(witness.next.v).toBe(1750n);

      const prover = new CircuitProver(loadCircuit("transfer"));
      try {
        const result = await prover.prove(witness.inputs);
        expect(await prover.verify(result)).toBe(true);
      } finally {
        await prover.destroy();
      }
    },
    180_000,
  );
});
