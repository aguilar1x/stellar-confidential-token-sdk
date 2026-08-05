/**
 * Event store behind the INDEXER.md API.
 *
 * The interface is deliberately tiny so the same handler can run on any
 * provider, with two independent deployments (INDEXER.md §7) differing only in
 * their store and never in their serving logic.
 *
 * ONE implementation ships today: `MemoryStore`. A KV-backed store on Cloudflare
 * and a file-backed one on a plain Node host are what this seam exists for, and
 * neither is written yet. The consequence is not cosmetic and is stated in the
 * README's limitations: without durable backing, a deployment rehydrates by
 * scanning the RPC on cold start, so it can only serve history the RPC still
 * retains — which is the very window an archive is supposed to outlive.
 *
 * Everything else here is independent of that: the C1-C4 surface, the
 * completeness accounting, and the client-side verification are real and are
 * what the tests and the demo exercise.
 *
 * The store owns the C3 answer, and that is the whole design point. Only the
 * component that knows which ledger ranges were actually ingested can honestly
 * say whether a requested range is gap-free — a serving layer that guesses
 * would be asserting exactly the thing a client must not have to trust.
 */

/**
 * @typedef {object} StoredEvent
 * @property {number} ledger_seq
 * @property {string} tx_hash
 * @property {number} event_index
 * @property {number} operation_index
 * @property {string[]} topics_xdr
 * @property {string} data_xdr
 * @property {string} contract_id
 * @property {string[]} participants  G-addresses this event concerns
 * @property {string} event_name
 */

/** Total order of §3.4: ledger, then operation, then event index. */
export function compareEvents(a, b) {
  return (
    a.ledger_seq - b.ledger_seq ||
    a.operation_index - b.operation_index ||
    a.event_index - b.event_index
  );
}

/** Opaque cursor: the total-order key of the last event returned. */
export function cursorOf(ev) {
  return `${ev.ledger_seq}-${ev.operation_index}-${ev.event_index}`;
}

function afterCursor(ev, cursor) {
  if (!cursor) return true;
  const [l, o, e] = cursor.split("-").map(Number);
  return compareEvents(ev, { ledger_seq: l, operation_index: o, event_index: e }) > 0;
}

export class MemoryStore {
  constructor() {
    /** @type {StoredEvent[]} */
    this.events = [];
    /** Contiguous ingested ranges, as [from, to] inclusive, kept merged+sorted. */
    this.ranges = [];
    this.latestLedger = 0;
    this.lastIngestAt = 0;
  }

  /**
   * Record events AND the range they were scanned over. The range matters even
   * when it yielded nothing: "I looked at ledgers 100..200 and there was
   * nothing for you" is a completeness fact, and without it every quiet range
   * would look like a gap.
   */
  ingest(events, fromLedger, toLedger, latestLedger) {
    const seen = new Set(this.events.map(cursorOf));
    for (const ev of events) {
      if (!seen.has(cursorOf(ev))) this.events.push(ev);
    }
    this.events.sort(compareEvents);
    this.#addRange(fromLedger, toLedger);
    this.latestLedger = Math.max(this.latestLedger, latestLedger ?? toLedger);
    this.lastIngestAt = this.latestLedger;
  }

  #addRange(from, to) {
    if (to < from) return;
    const merged = [...this.ranges, [from, to]].sort((a, b) => a[0] - b[0]);
    /** @type {number[][]} */
    const out = [];
    for (const [f, t] of merged) {
      const last = out[out.length - 1];
      // Adjacent ranges join: [1,10] and [11,20] leave no ledger unexamined.
      if (last && f <= last[1] + 1) last[1] = Math.max(last[1], t);
      else out.push([f, t]);
    }
    this.ranges = out;
  }

  /** Highest ledger fully ingested with no gap below it. */
  ingestedThrough() {
    const first = this.ranges[0];
    return first ? first[1] : 0;
  }

  /**
   * Lowest ledger this archive can answer for.
   *
   * C4 asks for the latest fully-ingested ledger so clients can bound
   * staleness. Publishing the floor as well is strictly more informative and
   * has a practical use: an archive that starts above genesis — every archive
   * built by scanning an RPC does, since the RPC only retains about a week —
   * would otherwise have to answer `complete: false` to any client asking from
   * the beginning, with no way for that client to discover which range it
   * COULD have asked for.
   */
  ingestedFrom() {
    const first = this.ranges[0];
    return first ? first[0] : 0;
  }

  /** C3 — is `[from, to]` covered by a single gap-free ingested range? */
  isComplete(from, to) {
    if (to < from) return true;
    return this.ranges.some(([f, t]) => f <= from && t >= to);
  }

  /**
   * C2 — ordered, filtered, paginated history for one account.
   * Returns one page plus the cursor to continue from.
   */
  query({ contractId, account, fromLedger, toLedger, types, cursor, limit }) {
    const matching = this.events.filter(
      (ev) =>
        ev.contract_id === contractId &&
        ev.participants.includes(account) &&
        ev.ledger_seq >= fromLedger &&
        (toLedger === undefined || ev.ledger_seq <= toLedger) &&
        (!types || types.includes(ev.event_name)) &&
        afterCursor(ev, cursor),
    );
    const page = matching.slice(0, limit);
    const more = matching.length > page.length;
    return {
      events: page,
      cursor: more && page.length ? cursorOf(page[page.length - 1]) : null,
    };
  }

  /** C1 — the latest checkpoint (a `merge`) at or before `atLedger`. */
  checkpoint({ contractId, account, atLedger }) {
    const candidates = this.events.filter(
      (ev) =>
        ev.contract_id === contractId &&
        ev.participants.includes(account) &&
        ev.event_name === "merge" &&
        ev.ledger_seq <= atLedger,
    );
    return candidates.length ? candidates[candidates.length - 1] : null;
  }
}
