import { describe, expect, it } from "vitest";
import type { Opening, ProofEnvelope } from "./index.js";

describe("stellar-confidential-token-sdk barrel", () => {
  it("exposes the frozen public types", () => {
    const envelope: ProofEnvelope = {
      payload: new Uint8Array([1]),
      proof: new Uint8Array([2]),
    };
    const opening: Opening = { v: 1n, r: 2n };

    expect(envelope.payload).toBeInstanceOf(Uint8Array);
    expect(envelope.proof).toBeInstanceOf(Uint8Array);
    expect(opening.v).toBe(1n);
    expect(opening.r).toBe(2n);
  });
});
