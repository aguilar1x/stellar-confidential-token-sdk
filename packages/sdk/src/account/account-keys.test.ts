import { describe, expect, it } from "vitest";

import { deriveAccountKeys, generateAccountSecret } from "./account-keys.js";
import { addressToField } from "../crypto/address.js";
import { H, scalarMul, pointToBytes } from "../crypto/grumpkin.js";
import { vkFromSk } from "../crypto/poseidon2.js";
import { FR_MODULUS } from "../crypto/constants.js";
import { toBytes32BE } from "../crypto/field.js";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";

const TOKEN = "CAPLH4ZW7EDSYRBCQN77Y4K7W5RNA6TO76JQ5CGHHIPY4ALWVQZ2WFAY";
const SK = 0x1234_5678_9abc_deffn;

describe("deriveAccountKeys", () => {
  it("returns 64-byte Y and viewingPub", () => {
    const keys = deriveAccountKeys(SK, TOKEN);
    expect(keys.Y).toBeInstanceOf(Uint8Array);
    expect(keys.Y).toHaveLength(64);
    expect(keys.viewingPub).toBeInstanceOf(Uint8Array);
    expect(keys.viewingPub).toHaveLength(64);
  });

  it("viewingPriv === vkFromSk(sk, addrF)", () => {
    const addrF = addressToField(TOKEN);
    const keys = deriveAccountKeys(SK, TOKEN);
    expect(keys.viewingPriv).toBe(vkFromSk(SK, addrF));
  });

  it("Y === pointToBytes(sk·H)", () => {
    const keys = deriveAccountKeys(SK, TOKEN);
    expect(keys.Y).toEqual(pointToBytes(scalarMul(SK, H)));
  });

  it("viewingPub === pointToBytes(vk·H)", () => {
    const addrF = addressToField(TOKEN);
    const keys = deriveAccountKeys(SK, TOKEN);
    expect(keys.viewingPub).toEqual(pointToBytes(scalarMul(vkFromSk(SK, addrF), H)));
  });

  it("kStore is 32 bytes and deterministic for a fixed sk", () => {
    const a = deriveAccountKeys(SK, TOKEN);
    const b = deriveAccountKeys(SK, TOKEN);
    expect(a.kStore).toHaveLength(32);
    expect(a.kStore).toEqual(b.kStore);
  });

  it("kStore matches HKDF-SHA256(be32(sk), info='cluster/zk/storage/v1')", () => {
    const expected = hkdf(sha256, toBytes32BE(SK), undefined, "cluster/zk/storage/v1", 32);
    expect(deriveAccountKeys(SK, TOKEN).kStore).toEqual(expected);
  });
});

describe("generateAccountSecret", () => {
  it("returns distinct sub-R scalars across calls", () => {
    const values = new Set<bigint>();
    for (let i = 0; i < 32; i++) {
      const s = generateAccountSecret();
      expect(s).toBeGreaterThan(0n);
      expect(s).toBeLessThan(FR_MODULUS);
      values.add(s);
    }
    expect(values.size).toBe(32);
  });
});
