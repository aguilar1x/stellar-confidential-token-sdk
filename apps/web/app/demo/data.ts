/**
 * The building's month, as produced on testnet by `examples/condominium.mjs`.
 *
 * Read straight from the file that script writes, rather than copied into a
 * constant here. A copy would be a second source of truth for numbers that a
 * reader is being asked to verify against the chain, and the two would drift
 * the first time the demo is regenerated.
 *
 * The building's key is published for the same reason the other demo account's
 * is: the page performs a real audit, which means opening a real commitment,
 * which needs the real viewing key. It is a testnet account holding nothing.
 */

import state from "../../../../examples/condominium-state.json";

export interface Unit {
  id: string;
  label: string;
  /** Stroops. Committed on-chain, never published there. */
  dues: string;
  address: string;
  tx?: string;
}

export interface Building {
  address: string;
  secret: string;
  fromLedger: number;
  units: Unit[];
}

const summary = (state as { summary?: Record<string, unknown> }).summary;

if (!summary) {
  throw new Error(
    "examples/condominium-state.json has no summary. Run `node examples/condominium.mjs` to completion first.",
  );
}

export const BUILDING: Building = {
  address: process.env.BUILDING_ADDRESS ?? (summary.building as string),
  // `BUILDING_SECRET` wins when set, so a deployment can audit its own building
  // rather than the one this repository ran. The committed seed is a testnet
  // account that exists on no other network.
  secret: process.env.BUILDING_SECRET ?? (summary.buildingSecret as string),
  fromLedger: Number(process.env.BUILDING_FROM_LEDGER ?? summary.fromLedger),
  units: summary.units as Unit[],
};
