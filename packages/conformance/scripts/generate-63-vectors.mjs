/**
 * Produce the two §6.3 vectors the specification requires and does not supply.
 *
 * SDK.md §6.3 lists three derivations that need fixture coverage. One,
 * `address_to_field`, is already pinned by `address_to_field.json`. The other
 * two are not pinned by anything:
 *
 *   δ_eph      DESIGN.md §5.3 — "No circuit constrains r_e, so a fixture is the
 *              only mechanism keeping a user's clients in agreement."
 *   §5.1 chain from a fixed root through addr_f and acct_f to sk, vk, Y and PVK,
 *              including the SEP-0053 signature preimage and the resulting
 *              signature.
 *
 * The δ_eph gap is the sharper of the two. Because no circuit constrains r_e, a
 * client that derives it differently produces proofs that verify perfectly — and
 * a second client belonging to the SAME user then cannot recompute the value,
 * so the sender loses the ability to prove what their own transfer contained.
 * Nothing detects that at proving time. A fixture is the only thing that can.
 *
 * Output is written in the same shape as OpenZeppelin's own testdata files, so
 * these can be contributed upstream as-is.
 *
 * Run: node scripts/generate-63-vectors.mjs
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Keypair } from "@stellar/stellar-sdk";
import {
  deriveEphemeralRE,
  deriveKeys,
  deriveSk,
  addressToField,
  pointCoords,
  skSigningMessage,
  skSigningPayload,
  vkFromSk,
  SK_DOMAIN,
  SEP53_PREFIX,
} from "stellar-confidential-token-sdk";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "vectors");

const hex = (n) => `0x${n.toString(16).padStart(64, "0")}`;
const b64 = (u8) => Buffer.from(u8).toString("base64");
const hexBytes = (u8) => `0x${Buffer.from(u8).toString("hex")}`;

/**
 * A fixed, published test seed — never a key holding value. Using a literal
 * seed rather than a random one is the point: the vector must be reproducible
 * by anyone, in any language, forever.
 */
const TEST_SEED = Buffer.alloc(32, 0x11);
const CONTRACT = "CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";

const keypair = Keypair.fromRawEd25519Seed(TEST_SEED);
const ACCOUNT = keypair.publicKey();

// --- §5.1 chain ------------------------------------------------------------

const message = skSigningMessage(CONTRACT, ACCOUNT);
const payload = skSigningPayload(CONTRACT, ACCOUNT);
const root = new Uint8Array(keypair.sign(Buffer.from(payload)));

const { sk, vk, j, addrF, acctF } = deriveSk(root, CONTRACT, ACCOUNT);
const keys = deriveKeys(sk, addrF);
const Y = pointCoords(keys.Y);
const PVK = pointCoords(keys.PVK);

const skChain = {
  primitive: "sk_derivation_chain",
  design_doc_refs: ["SDK.md Section 5.1", "SDK.md Section 6.3"],
  description:
    "The full account-secret derivation, from a SEP-0053 signer root through " +
    "addr_f and acct_f to sk, vk, Y and PVK. Section 6.3 requires a fixture " +
    "for this chain including the signature preimage and the resulting " +
    "signature; none is published, so this one is offered. The rejection " +
    "counter j is included because it is an OUTPUT, not an input: a client " +
    "that samples candidates differently lands on a different j and therefore " +
    "a different sk from the same root.",
  vectors: [
    {
      inputs: {
        ed25519_seed: hexBytes(TEST_SEED),
        contract: CONTRACT,
        account: ACCOUNT,
      },
      intermediate: {
        sk_domain: SK_DOMAIN,
        sep53_prefix: SEP53_PREFIX,
        signed_message_utf8: new TextDecoder().decode(message),
        signed_message_hex: hexBytes(message),
        sep53_payload_sha256: hexBytes(payload),
        root_signature: hexBytes(root),
        root_signature_base64: b64(root),
        addr_f: hex(addrF),
        acct_f: hex(acctF),
        rejection_counter_j: j,
      },
      output: {
        sk: hex(sk),
        vk: hex(vk),
        Y: { x: hex(Y.x), y: hex(Y.y) },
        PVK: { x: hex(PVK.x), y: hex(PVK.y) },
      },
    },
  ],
};

// --- δ_eph -----------------------------------------------------------------

// Derived from the SAME vk the chain above produces, so the two vectors compose
// rather than standing on unrelated inputs.
const SIGMAS = [0x01n, 0x02n, 0xfeedfacen];

const ephemeral = {
  primitive: "delta_eph",
  design_doc_refs: ["DESIGN.md Section 5.3", "SDK.md Section 6.3"],
  description:
    "Wallet-side deterministic ephemeral scalar r_e = Poseidon2(EPHEMERAL_KEY, " +
    "vk, sigma). Section 6.3 calls for this fixture because NO CIRCUIT " +
    "CONSTRAINS r_e — only R_e = r_e*H and r_e != 0 are constrained — so a " +
    "client that derives it differently still produces proofs that verify. The " +
    "damage appears later and silently: a second client belonging to the same " +
    "user cannot recompute r_e, and the sender loses the ability to prove what " +
    "their own transfer contained. A fixture is the only mechanism that keeps " +
    "a user's clients in agreement.",
  vectors: SIGMAS.map((sigma) => ({
    inputs: { vk: hex(vk), sigma: hex(sigma) },
    output: hex(deriveEphemeralRE(vk, sigma)),
  })),
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "sk_derivation_chain.json"), JSON.stringify(skChain, null, 2) + "\n");
writeFileSync(join(OUT, "delta_eph.json"), JSON.stringify(ephemeral, null, 2) + "\n");

console.log(`wrote ${join(OUT, "sk_derivation_chain.json")}`);
console.log(`wrote ${join(OUT, "delta_eph.json")}`);
console.log(`\naccount ${ACCOUNT}`);
console.log(`sk      ${hex(sk)}`);
console.log(`vk      ${hex(vk)}  (j = ${j})`);
console.log(`\nSanity: vk recomputed from sk = ${hex(vkFromSk(sk, addrF))}`);
