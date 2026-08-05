import { describe, expect, it } from "vitest";
import { addressToField } from "./address.js";
import { toHex32 } from "./field.js";

describe("addressToField", () => {
  // THE ANCHOR TEST — proves our Poseidon2 + strkey split/endianness/domain-tag
  // pipeline matches the chain. The expected value is the deployed confidential
  // token contract's on-chain `addrF` (storage.rs::address_to_field).
  it("matches the deployed token contract's on-chain addrF", () => {
    const strkey = "CAPLH4ZW7EDSYRBCQN77Y4K7W5RNA6TO76JQ5CGHHIPY4ALWVQZ2WFAY";
    const expected =
      0x0de199aa7f3532a9255238da36cee1dde1f801681a5074e7b34881f315614b07n;
    const actual = addressToField(strkey);
    expect(toHex32(actual)).toBe(toHex32(expected));
    expect(actual).toBe(expected);
  });

  it("rejects a strkey of the wrong length", () => {
    expect(() => addressToField("CABC")).toThrow(/56-char strkey/);
  });

  it("is deterministic", () => {
    const strkey = "CAPLH4ZW7EDSYRBCQN77Y4K7W5RNA6TO76JQ5CGHHIPY4ALWVQZ2WFAY";
    expect(addressToField(strkey)).toBe(addressToField(strkey));
  });
});
