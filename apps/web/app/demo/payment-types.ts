/**
 * The wire format between the payment endpoint and the button.
 *
 * Kept in its own module with no imports so the client component can share the
 * types without pulling the proving stack into the browser bundle.
 */

const XLM = 10_000_000n;

/** Bounds enforced on the server. The input box is a convenience, not a check. */
export const MIN_STROOPS = 1n;
export const MAX_STROOPS = 25n * XLM;

/** What the amount box starts at: reads as money, leaves the guest solvent. */
export const DEFAULT_AMOUNT = (3n * XLM).toString();

/**
 * The four stages, in the order they happen. Named for what they accomplish
 * rather than for the functions involved, because these labels are read by
 * someone deciding whether to believe the page.
 */
export const STAGES = [
  {
    key: "derive",
    label: "Deriving the key",
    detail: "One signature through §5.1 — nothing stored, reproducible on any device.",
  },
  {
    key: "rebuild",
    label: "Rebuilding the balance",
    detail: "Replaying this account's history and checking it against the chain.",
  },
  {
    key: "prove",
    label: "Proving",
    detail: "Witness generation, then UltraHonk. The amount never leaves the browser's sender.",
  },
  {
    key: "submit",
    label: "Submitting",
    detail: "Into a Soroban transaction, then waiting for the ledger to close.",
  },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

/** Wall-clock cost of each stage, in ms. Measured, never estimated. */
export type Timings = Partial<Record<StageKey, number>>;

/**
 * One line of NDJSON. `started` is emitted when a stage actually begins and
 * `finished` when it actually ends, so the progress a reader watches is the
 * server's real position and not a timer pretending to be one.
 */
export type PaymentEvent =
  | { type: "started"; stage: StageKey }
  | { type: "finished"; stage: StageKey; ms: number }
  | {
      type: "done";
      tx: string;
      amountStroops: string;
      payloadBytes: number;
      timings: Timings;
    }
  | { type: "error"; error: string };
