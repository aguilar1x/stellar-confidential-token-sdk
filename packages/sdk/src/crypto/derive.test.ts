import { describe, expect, it } from "vitest";

import { deriveWrapKeypair, wrapKeyMessage, skFromSignature } from "./derive.js";
import { FR_MODULUS } from "./constants.js";

const SIG_A = new Uint8Array(64).fill(0xab);
const SIG_B = (() => {
  const s = new Uint8Array(64).fill(0xab);
  s[63] = 0xcd; // one byte different
  return s;
})();

describe("deriveWrapKeypair", () => {
  it("returns a 32-byte publicKey and 32-byte secretKey", () => {
    const kp = deriveWrapKeypair(SIG_A);
    expect(kp.publicKey).toBeInstanceOf(Uint8Array);
    expect(kp.publicKey).toHaveLength(32);
    expect(kp.secretKey).toBeInstanceOf(Uint8Array);
    expect(kp.secretKey).toHaveLength(32);
  });

  it("is deterministic for a fixed signature", () => {
    const a = deriveWrapKeypair(SIG_A);
    const b = deriveWrapKeypair(SIG_A);
    expect(a.secretKey).toEqual(b.secretKey);
    expect(a.publicKey).toEqual(b.publicKey);
  });

  it("produces a different key for a different signature", () => {
    const a = deriveWrapKeypair(SIG_A);
    const b = deriveWrapKeypair(SIG_B);
    expect(a.publicKey).not.toEqual(b.publicKey);
    expect(a.secretKey).not.toEqual(b.secretKey);
  });
});

describe("wrapKeyMessage", () => {
  it("binds the message to the token contract id", () => {
    const token = "CAPLH4ZW7EDSYRBCQN77Y4K7W5RNA6TO76JQ5CGHHIPY4ALWVQZ2WFAY";
    expect(wrapKeyMessage(token)).toBe(`cluster:confidential:wrap-key:v1:${token}`);
  });
});

describe("skFromSignature", () => {
  it("is deterministic and sub-R", () => {
    const a = skFromSignature(SIG_A);
    const b = skFromSignature(SIG_A);
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0n);
    expect(a).toBeLessThan(FR_MODULUS);
  });

  it("differs for a different signature", () => {
    expect(skFromSignature(SIG_A)).not.toBe(skFromSignature(SIG_B));
  });
});
