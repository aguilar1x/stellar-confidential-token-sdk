/**
 * The pinned demo account.
 *
 * The page runs the REAL client, which means it needs a real signer: the
 * account secret is derived from a SEP-0053 signature, so without a key there
 * is nothing to decrypt the account's own events with, and the demo would be
 * reduced to displaying precomputed numbers.
 *
 * So this seed is published deliberately. It is a testnet account holding
 * nothing of value, created for this demonstration, and anyone may use it. The
 * alternative — asking a visitor to connect a wallet and sign — adds friction
 * to the one thing the page exists to show.
 *
 * Its history on testnet: registered, deposited 100 XLM, merged, then sent 40
 * XLM confidentially. That transfer's amount does not appear on-chain.
 */

export const DEMO = {
  /** Published on purpose. Testnet. Holds nothing. */
  aliceSecret: "SCKCCPRV6CUUSTD4NGRLZM3WGIZ4FC7U2ZGROLJYDVNEXSPD6GMBCEMF",
  alice: "GDPKVZUNM2G632S53NBYB5PLERIYNBDKXC3GAO2LNHRVQDVGKNQWLAUK",
  bob: "GB4ZQ6YXZPJW5DCCNIVTHUMF7PLXZV46QT7OJCUKJ67MOJKNROGWYHER",

  /** What actually happened, so the page can state it rather than assert it. */
  history: [
    { step: "register", tx: "8068ac25610586ac84f869355120e953706a67a132657970fc0b4d9eb4ad9dfd" },
    { step: "deposit 100 XLM", tx: "746434c6794d9e6b26fe660404ba342a8c54d4be43d1f4d077f63a67aecfd1ac" },
    { step: "merge", tx: "9c1e4fd8a2d2d52fccba5e531999210076a13a3ac286f1b511557f879be14aa0" },
    {
      step: "transfer 40 XLM (amount hidden)",
      tx: "b67729493245ed3046980d8aa8adca2c276661d935b6dc9188d7f7b1bbb4dba5",
    },
  ],

  /** Truth, for the page to compare against: 100 deposited, 40 sent. */
  expectedSpendableStroops: 600_000_000n,
} as const;

/**
 * Network and contract targets, overridable so a deployment is not stuck with
 * the addresses this repository happens to have deployed against.
 *
 * `RPC_URL` and `NETWORK_PASSPHRASE` move together on purpose: pointing the RPC
 * at another network while the passphrase still says testnet produces
 * signatures that node rejects, which is a confusing way to find out.
 */
export const RPC_URL = process.env.RPC_URL ?? "https://soroban-testnet.stellar.org";

/**
 * Where the archives start scanning.
 *
 * The demo account's history is closed — it sits in ledgers 3976175..3976748
 * and nothing will be added to it. Scanning from the RPC's retention floor
 * instead would examine 120,000 ledgers to find the same fifteen events, which
 * costs about two seconds against a third of a second and grows every day.
 *
 * That matters because neither Vercel nor Cloudflare keeps memory between cold
 * starts, so this scan can run on a page load rather than once at boot.
 *
 * It stays honest: the archive reports this as its `ingested_from`, so a client
 * asking for earlier history is truthfully told the range is not covered.
 */
export const INDEX_FROM_LEDGER = Number(process.env.INDEX_FROM_LEDGER ?? 3_976_100);
export const NETWORK_PASSPHRASE =
  process.env.NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";

export const CONTRACTS = {
  token: process.env.TOKEN_CONTRACT ?? "CAPLH4ZW7EDSYRBCQN77Y4K7W5RNA6TO76JQ5CGHHIPY4ALWVQZ2WFAY",
  verifier:
    process.env.VERIFIER_CONTRACT ?? "CC6NG5LWW6QA4YSW2RP7RR2CE5FF6IHAGJEYY4STG6QP563EWSZU5DG7",
  auditor:
    process.env.AUDITOR_CONTRACT ?? "CAEYYDRJPJ73UR3UZWYLSIWW4CHUZILTSENAWOUYXGSR4LPY4HQ23R4L",
} as const;

export const EXPLORER =
  process.env.NEXT_PUBLIC_EXPLORER ?? "https://stellar.expert/explorer/testnet/tx";

/**
 * The same explorer, for the two things a reader needs in order to check our
 * inputs rather than only our arithmetic: the contract that holds the
 * commitment, and the account it is held for.
 *
 * Derived from `EXPLORER` so a deployment pointing at a different explorer moves
 * all three together, instead of overriding one and silently keeping two links
 * aimed at stellar.expert.
 */
const EXPLORER_ROOT = EXPLORER.replace(/\/tx\/?$/, "");
export const EXPLORER_CONTRACT = `${EXPLORER_ROOT}/contract`;
export const EXPLORER_ACCOUNT = `${EXPLORER_ROOT}/account`;

/**
 * A second archive, independently deployed on a different provider.
 *
 * INDEXER.md §7 asks wallets to support multiple independent archive endpoints,
 * "with deployments running or contracting at least two". Independent means
 * different operators — two instances on one provider share an outage, which is
 * the failure the requirement exists to prevent. This one is a Cloudflare
 * Worker; the page itself runs on Vercel.
 *
 * Empty disables the card, so a Worker outage degrades the page instead of
 * breaking it. The four archives below are served by this deployment and always
 * work.
 */
export const EXTERNAL_ARCHIVE =
  process.env.NEXT_PUBLIC_EXTERNAL_ARCHIVE ??
  "https://confidential-token-archive.aaguilar1x.workers.dev";

/** The archives the page points the client at, in the order shown. */
export const ARCHIVES = [
  {
    id: "honest",
    title: "Honest",
    blurb: "Serves the chain faithfully and vouches for the range it scanned.",
  },
  {
    id: "lagging",
    title: "Lagging",
    blurb: "Has a real gap — and says so. It does not claim to be complete.",
  },
  {
    id: "omitting",
    title: "Omitting",
    blurb: "Silently drops your merge event, while still claiming complete: true.",
  },
  {
    id: "corrupting",
    title: "Corrupting",
    blurb: "Alters your balance ciphertext, while still claiming complete: true.",
  },
  {
    id: "independent",
    title: "Independent (Cloudflare)",
    blurb:
      "A second archive, deployed separately on another provider — what §7 means by two independent endpoints.",
  },
] as const;

export type ArchiveId = (typeof ARCHIVES)[number]["id"];
