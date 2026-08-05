/**
 * The visitor's own payments, remembered for the length of the visit.
 *
 * The receipt used to live only in `/verify`'s query string, so it survived
 * exactly one navigation: pay, follow the link, then click anything else and the
 * thing they had just done was gone. A judge who wanders to /how and comes back
 * should not have to pay again to see their own check.
 *
 * A LIST rather than one entry, because a visitor who is convinced by the first
 * payment tends to make a second — and overwriting turns their own history into
 * whichever one happened to be last. The building's total folds all of them, so
 * a panel claiming to show "your receipt" while hiding two of three is quietly
 * wrong about the number it is standing next to.
 *
 * sessionStorage rather than a cookie, deliberately. A cookie would be attached
 * to every request the browser makes to this origin — each page, each RSC
 * payload, each asset — to carry state no server reads. It also outlives the tab
 * by default, which is the opposite of "during this visit". sessionStorage is
 * scoped to the tab and dies with it, which is exactly the lifetime asked for,
 * and it never leaves the machine.
 */

export const RECEIPT_KEY = "ct-demo-receipt";

/** Enough to show a session's worth without letting a loop fill storage. */
const MAX_KEPT = 12;

export interface StoredReceipt {
  /** Transaction hash, 64 hex characters. */
  tx: string;
  /** Amount paid in stroops, as a decimal string. Empty when unknown. */
  amountStroops: string;
}

const isTxHash = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{64}$/i.test(s);
const isStroops = (s: unknown): s is string =>
  typeof s === "string" && (s === "" || /^\d{1,20}$/.test(s));

function sanitize(value: unknown): StoredReceipt | null {
  if (typeof value !== "object" || value === null) return null;
  const { tx, amountStroops } = value as Record<string, unknown>;
  if (!isTxHash(tx) || !isStroops(amountStroops)) return null;
  return { tx, amountStroops };
}

/**
 * Newest first, deduplicated by transaction hash.
 *
 * Dedup matters because the same payment arrives twice: once when the stream
 * settles, and again from the `?receipt=` link the visitor follows afterwards.
 */
export function mergeReceipts(...groups: (StoredReceipt | null | undefined)[][]): StoredReceipt[] {
  const seen = new Set<string>();
  const out: StoredReceipt[] = [];
  for (const group of groups) {
    for (const r of group) {
      if (!r || seen.has(r.tx)) continue;
      seen.add(r.tx);
      out.push(r);
    }
  }
  return out.slice(0, MAX_KEPT);
}

export function saveReceipt(r: StoredReceipt): void {
  try {
    sessionStorage.setItem(RECEIPT_KEY, JSON.stringify(mergeReceipts([r], loadReceipts())));
  } catch {
    // Private mode, or a storage quota. Losing a receipt is not worth an error.
  }
}

/**
 * Read them back, validating on the way out.
 *
 * Anything in storage is user-writable, and these values end up in URLs and in
 * rendered text — so each is re-checked against the same shapes the query string
 * is, rather than trusted because we were the ones who wrote it. A single object
 * is accepted too, which is what earlier visits in an open tab may still hold.
 */
export function loadReceipts(): StoredReceipt[] {
  try {
    const raw = sessionStorage.getItem(RECEIPT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.map(sanitize).filter((r): r is StoredReceipt => r !== null);
  } catch {
    return [];
  }
}
