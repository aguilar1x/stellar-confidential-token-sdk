import { describe, expect, it } from "vitest";

import { encryptOpening, decryptOpening } from "./openings.js";
import type { Opening } from "../types.js";

const K_STORE = new Uint8Array(32).fill(0x42);
const WRONG = new Uint8Array(32).fill(0x43);

const OPENING: Opening = {
  v: 1_000_000n,
  r: 0x0abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456789n,
};

describe("encryptOpening / decryptOpening", () => {
  it("roundtrips the opening", () => {
    const blob = encryptOpening(OPENING, K_STORE);
    expect(decryptOpening(blob, K_STORE)).toEqual(OPENING);
  });

  it("throws when decrypted with the wrong k_store", () => {
    const blob = encryptOpening(OPENING, K_STORE);
    expect(() => decryptOpening(blob, WRONG)).toThrow();
  });

  it("uses a fresh random nonce: two encryptions differ", () => {
    const a = encryptOpening(OPENING, K_STORE);
    const b = encryptOpening(OPENING, K_STORE);
    expect(a).not.toEqual(b);
    // Both still decrypt to the same opening.
    expect(decryptOpening(a, K_STORE)).toEqual(OPENING);
    expect(decryptOpening(b, K_STORE)).toEqual(OPENING);
  });

  it("throws when the ciphertext is tampered", () => {
    const blob = encryptOpening(OPENING, K_STORE);
    blob[40] = blob[40]! ^ 0x01; // flip a byte inside the ciphertext (past the 24-byte nonce)
    expect(() => decryptOpening(blob, K_STORE)).toThrow();
  });

  it("throws when encrypting with a wrong-length k_store", () => {
    const shortKey = new Uint8Array(16).fill(0x42);
    expect(() => encryptOpening(OPENING, shortKey)).toThrow();
  });
});
