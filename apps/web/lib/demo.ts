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

export const RPC_URL = "https://soroban-testnet.stellar.org";

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
export const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

export const CONTRACTS = {
  token: "CAPLH4ZW7EDSYRBCQN77Y4K7W5RNA6TO76JQ5CGHHIPY4ALWVQZ2WFAY",
  verifier: "CC6NG5LWW6QA4YSW2RP7RR2CE5FF6IHAGJEYY4STG6QP563EWSZU5DG7",
  auditor: "CAEYYDRJPJ73UR3UZWYLSIWW4CHUZILTSENAWOUYXGSR4LPY4HQ23R4L",
} as const;

export const EXPLORER = "https://stellar.expert/explorer/testnet/tx";

/** The four archives the page points the client at, in the order shown. */
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
] as const;

export type ArchiveId = (typeof ARCHIVES)[number]["id"];
