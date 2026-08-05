import { describe, expect, it } from "vitest";
import {
  frMod,
  frAdd,
  frSub,
  isCanonicalFr,
  toBytes32BE,
  fromBytesBE,
  fromBytesLE,
  toHex32,
  fromHex,
  bytesToHex,
  hexToBytes,
  randomScalar,
} from "./field.js";
import { FR_MODULUS } from "./constants.js";

describe("field", () => {
  it("frMod reduces into [0, r)", () => {
    expect(frMod(FR_MODULUS)).toBe(0n);
    expect(frMod(FR_MODULUS + 5n)).toBe(5n);
    expect(frMod(-1n)).toBe(FR_MODULUS - 1n);
    expect(isCanonicalFr(frMod(FR_MODULUS * 3n + 7n))).toBe(true);
  });

  it("frAdd / frSub wrap around the modulus", () => {
    expect(frAdd(FR_MODULUS - 1n, 2n)).toBe(1n);
    expect(frSub(0n, 1n)).toBe(FR_MODULUS - 1n);
  });

  it("isCanonicalFr rejects out-of-range values", () => {
    expect(isCanonicalFr(0n)).toBe(true);
    expect(isCanonicalFr(FR_MODULUS - 1n)).toBe(true);
    expect(isCanonicalFr(FR_MODULUS)).toBe(false);
    expect(isCanonicalFr(-1n)).toBe(false);
  });

  it("big-endian I/O roundtrips (BE encode → decode)", () => {
    for (const v of [0n, 1n, 255n, 256n, 0xdeadbeefn, FR_MODULUS - 1n]) {
      const bytes = toBytes32BE(v);
      expect(bytes.length).toBe(32);
      expect(fromBytesBE(bytes)).toBe(v);
    }
  });

  it("toBytes32BE is big-endian (MSB first)", () => {
    const bytes = toBytes32BE(1n);
    expect(bytes[31]).toBe(1);
    expect(bytes[0]).toBe(0);
    const b2 = toBytes32BE(0x0102n);
    expect(b2[30]).toBe(1);
    expect(b2[31]).toBe(2);
  });

  it("fromBytesLE reads little-endian", () => {
    const bytes = new Uint8Array([1, 2, 0, 0]);
    expect(fromBytesLE(bytes)).toBe(0x0201n);
  });

  it("toBytes32BE rejects out-of-256-bit values", () => {
    expect(() => toBytes32BE(-1n)).toThrow(RangeError);
    expect(() => toBytes32BE(1n << 256n)).toThrow(RangeError);
  });

  it("hex I/O roundtrips", () => {
    const v = 0x0de199aa7f3532a9255238da36cee1dde1f801681a5074e7b34881f315614b07n;
    expect(fromHex(toHex32(v))).toBe(v);
    expect(toHex32(v)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(fromHex("0x10")).toBe(16n);
    expect(fromHex("10")).toBe(16n);
  });

  it("bytesToHex / hexToBytes roundtrip", () => {
    const bytes = toBytes32BE(0xcafebaben);
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
    expect(hexToBytes("0x00ff")).toEqual(new Uint8Array([0, 255]));
  });

  it("randomScalar produces canonical, nonzero, distinct values", () => {
    const a = randomScalar();
    const b = randomScalar();
    expect(a).not.toBe(0n);
    expect(isCanonicalFr(a)).toBe(true);
    expect(isCanonicalFr(b)).toBe(true);
    expect(a).not.toBe(b);
  });
});
