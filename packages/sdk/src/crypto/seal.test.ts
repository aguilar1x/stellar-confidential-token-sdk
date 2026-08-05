import { describe, expect, it } from "vitest";

import { sealSecret, unsealSecret } from "./seal.js";
import { deriveWrapKeypair } from "./derive.js";

const WRAP = deriveWrapKeypair(new Uint8Array(64).fill(0xab));
const OTHER = deriveWrapKeypair(new Uint8Array(64).fill(0xcd));

const SK = 0x1234567890abcdef1234567890abcdefn;

describe("sealSecret / unsealSecret", () => {
  it("roundtrips the secret scalar", () => {
    const ct = sealSecret(SK, WRAP.publicKey);
    expect(unsealSecret(ct, WRAP)).toBe(SK);
  });

  it("produces an 80-byte ciphertext", () => {
    const ct = sealSecret(SK, WRAP.publicKey);
    expect(ct).toHaveLength(80);
  });

  it("is anonymous: two seals of the same sk to the same key differ", () => {
    const a = sealSecret(SK, WRAP.publicKey);
    const b = sealSecret(SK, WRAP.publicKey);
    expect(a).not.toEqual(b);
    // Both still decrypt to the same secret.
    expect(unsealSecret(a, WRAP)).toBe(SK);
    expect(unsealSecret(b, WRAP)).toBe(SK);
  });

  it("throws when the ciphertext is tampered", () => {
    const ct = sealSecret(SK, WRAP.publicKey);
    ct[40] = ct[40]! ^ 0x01; // flip a byte inside the box
    expect(() => unsealSecret(ct, WRAP)).toThrow();
  });

  it("throws when opened with the wrong wrap keypair", () => {
    const ct = sealSecret(SK, WRAP.publicKey);
    expect(() => unsealSecret(ct, OTHER)).toThrow();
  });
});
