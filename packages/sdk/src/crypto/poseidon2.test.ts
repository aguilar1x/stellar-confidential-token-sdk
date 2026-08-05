import { describe, expect, it } from "vitest";
import {
  sponge,
  poseidonWithDomain,
  spongeSqueeze2,
  vkFromSk,
  encryptBalance,
  decryptWithDomain,
} from "./poseidon2.js";
import { addressToField } from "./address.js";
import { DOMAIN } from "./constants.js";
import { frMod, toHex32 } from "./field.js";
import { FR_MODULUS } from "./constants.js";

// Anchor addrF of the deployed token contract (see address.test.ts).
const ADDR_F =
  0x0de199aa7f3532a9255238da36cee1dde1f801681a5074e7b34881f315614b07n;

describe("poseidon2", () => {
  it("all sponge outputs are canonical F_r elements", () => {
    const out = sponge([1n, 2n, 3n, 4n, 5n]);
    expect(out >= 0n && out < FR_MODULUS).toBe(true);
  });

  it("poseidonWithDomain prepends the domain tag (== sponge([d, ...inputs]))", () => {
    expect(poseidonWithDomain(DOMAIN.ADDRESS, [7n, 8n])).toBe(
      sponge([DOMAIN.ADDRESS, 7n, 8n]),
    );
  });

  it("address_to_field is poseidonWithDomain(ADDRESS, [lo, hi])", () => {
    // Cross-check the anchor addrF is reproducible via the raw funnel.
    const strkey = "CAPLH4ZW7EDSYRBCQN77Y4K7W5RNA6TO76JQ5CGHHIPY4ALWVQZ2WFAY";
    expect(addressToField(strkey)).toBe(ADDR_F);
  });

  // Known-answer / self-consistency vector. There are no test vectors in the
  // reference SDK, so this value was captured by running the ported sponge
  // against the @zkpassport/poseidon2 permutation (the same primitive the
  // circuit uses). It locks the (domain-tag, IV, absorb order) convention so
  // any future drift in this file breaks the test.
  it("vkFromSk is deterministic and matches the captured known-answer", () => {
    const vk = vkFromSk(123456789n, ADDR_F);
    expect(toHex32(vk)).toBe(
      "0x146d1153100003142d9dabd55a268f91ad3d9acd3125cfa42e417ea614422036",
    );
    expect(vkFromSk(123456789n, ADDR_F)).toBe(vk);
  });

  it("spongeSqueeze2 returns two masks matching the captured known-answer", () => {
    const [m0, m1] = spongeSqueeze2(DOMAIN.TX_AMOUNT, 111n, 222n);
    expect(toHex32(m0)).toBe(
      "0x16d375090d42d1e04d01a43ef2563f982d162c7510c6ecc43405e0bca9e84335",
    );
    expect(toHex32(m1)).toBe(
      "0x09692b212eeace36afb352e47578c9947549ca43d74b34da563e317700d538d1",
    );
  });

  it("encryptBalance / decryptWithDomain roundtrip (additive-mask homomorphism)", () => {
    const vNew = 500n;
    const vk = vkFromSk(42n, ADDR_F);
    const sigma = 777n;
    const bTilde = encryptBalance(vNew, vk, sigma);
    const recovered = decryptWithDomain(bTilde, DOMAIN.ENCRYPTED_BALANCE, vk, sigma);
    expect(frMod(recovered)).toBe(vNew);
  });
});
