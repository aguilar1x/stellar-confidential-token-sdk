import { describe, expect, it } from "vitest";
import {
  G,
  H,
  IDENTITY,
  Grumpkin,
  scalarMul,
  commit,
  pointToBytes,
  pointFromBytes,
  isIdentity,
  type Point,
} from "./grumpkin.js";
import { G_X, G_Y, FR_MODULUS } from "./constants.js";

function eq(a: Point, b: Point): boolean {
  return a.equals(b);
}

describe("grumpkin", () => {
  it("has G as the curve base point (index 0)", () => {
    const { x, y } = G.toAffine();
    expect(x).toBe(G_X);
    expect(y).toBe(G_Y);
  });

  it("scalarMul(1, G) === G", () => {
    expect(eq(scalarMul(1n, G), G)).toBe(true);
  });

  it("scalarMul(0, G) is the identity", () => {
    expect(isIdentity(scalarMul(0n, G))).toBe(true);
  });

  it("scalarMul is additively homomorphic: 2·G === G + G, 3·G === 2·G + G", () => {
    const g2 = scalarMul(2n, G);
    expect(eq(g2, G.add(G))).toBe(true);
    const g3 = scalarMul(3n, G);
    expect(eq(g3, g2.add(G))).toBe(true);
  });

  it("point → bytes → point roundtrips (G, H, and a scalar multiple)", () => {
    const p = scalarMul(7n, H);
    for (const pt of [G, H, p]) {
      const back = pointFromBytes(pointToBytes(pt));
      expect(eq(back, pt)).toBe(true);
    }
  });

  it("encodes the identity as 64 zero bytes and decodes it back", () => {
    const bytes = pointToBytes(IDENTITY);
    expect(bytes.length).toBe(64);
    expect(bytes.every((b) => b === 0)).toBe(true);
    expect(isIdentity(pointFromBytes(bytes))).toBe(true);
  });

  it("G and H are independent generators (H is not the base point)", () => {
    expect(eq(G, H)).toBe(false);
  });

  it("commit(v, r) === v·G + r·H", () => {
    const v = 42n;
    const r = 99n;
    const expected = scalarMul(v, G).add(scalarMul(r, H));
    expect(eq(commit(v, r), expected)).toBe(true);
  });

  it("scalars near the field modulus reduce correctly", () => {
    // r < p, so an F_r-max scalar is a valid multiplier with no wraparound.
    const s = FR_MODULUS - 1n;
    expect(eq(scalarMul(s, G), Grumpkin.BASE.multiply(s))).toBe(true);
  });
});
