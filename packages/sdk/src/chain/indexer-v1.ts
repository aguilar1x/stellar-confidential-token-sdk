/**
 * INDEXER.md client — the conformant archive source.
 *
 * The spec defines four capabilities. Three are REQUIRED:
 *
 *   C2  ordered history for `(contract_id, account)` over a ledger range,
 *       paginated, in the total order of §3.4
 *   C3  a completeness signal: `complete: true` ONLY when the indexer holds a
 *       gap-free history for the whole requested range
 *   C4  ingestion status, so a client can bound its own staleness
 *
 * C1 (latest checkpoint) is RECOMMENDED; a client can scan ordered history
 * instead.
 *
 * C3 is the one that carries safety weight, and it is the one an ad-hoc
 * indexer API tends to omit. Without it a client cannot distinguish "here is
 * your history" from "here is some of your history": it replays what it got,
 * reconstructs a balance that is simply wrong, and has no signal that anything
 * was missing. This client therefore treats `complete` as load-bearing —
 * {@link IndexerV1Client.orderedHistory} surfaces it, and
 * {@link IndexerV1Client.fetchEvents} REFUSES an incomplete range by default
 * rather than quietly returning a partial replay.
 *
 * Note the spec serves `topics_xdr` / `data_xdr`, so decoding runs through the
 * same XDR path as the RPC reader (`dataMap` from `events.ts`). That is what
 * makes an indexer-sourced event byte-identical to its RPC twin.
 *
 * Browser-safe: global `fetch` only.
 */

import { Address, xdr } from "@stellar/stellar-sdk";

import {
  KNOWN,
  buildConfidentialEvent,
  dataMap,
  naturalEventId,
  type ConfidentialEvent,
} from "./events.js";

export interface IndexerV1Config {
  /** Base URL of a conformant indexer, e.g. `https://idx.example.com`. */
  baseUrl: string;
  /** Optional label used in errors, so a two-endpoint setup names the culprit. */
  label?: string;
}

/** C4 — ingestion status. */
export interface IngestionStatus {
  /** Chain head as the indexer sees it. */
  latestLedger: number;
  /** Highest ledger fully ingested; the client's staleness bound. */
  ingestedThrough: number;
  /**
   * Lowest ledger the archive can answer for. Zero when unreported. An archive
   * built by scanning an RPC starts above genesis, so a client that assumes
   * coverage from ledger one gets `complete: false` from a perfectly honest
   * archive and cannot tell that apart from a real gap.
   */
  ingestedFrom: number;
  /** Seconds between the chain head and what has been ingested. */
  lagSeconds: number;
}

/** One event row as served by a conformant indexer (§3.1). */
export interface IndexerEventRow {
  ledger_seq: number;
  tx_hash: string;
  event_index: number;
  /** Base64 XDR of each topic ScVal. */
  topics_xdr: string[];
  /** Base64 XDR of the event data ScVal. */
  data_xdr: string;
  /** Operation index; optional in the spec's shape, defaulted to 0. */
  operation_index?: number;
}

/** C2 + C3 — an ordered, paginated page that states its own completeness. */
export interface OrderedHistoryPage {
  events: ConfidentialEvent[];
  /** Opaque continuation cursor, or `null` when the range is exhausted. */
  cursor: string | null;
  /** C3: gap-free over the WHOLE requested range. */
  complete: boolean;
}

export type EventTypeName = "register" | "deposit" | "merge" | "withdraw" | "transfer";

export interface HistoryQuery {
  contractId: string;
  account: string;
  fromLedger: number;
  toLedger?: number;
  types?: EventTypeName[];
  cursor?: string;
  limit?: number;
}

/** Thrown when an indexer serves a range it admits is not gap-free. */
export class IncompleteHistoryError extends Error {
  constructor(
    readonly indexer: string,
    readonly query: HistoryQuery,
  ) {
    super(
      `indexer ${indexer} reported an INCOMPLETE history for ` +
        `${query.account} over ledgers ${query.fromLedger}..${query.toLedger ?? "head"}. ` +
        "Replaying a partial history reconstructs a wrong balance, so it was refused. " +
        "Retry later, or use a second independent endpoint (INDEXER.md §7).",
    );
    this.name = "IncompleteHistoryError";
  }
}

const DEFAULT_PAGE_LIMIT = 200;

export class IndexerV1Client {
  constructor(readonly cfg: IndexerV1Config) {}

  /** Human-readable identity for error messages. */
  get label(): string {
    return this.cfg.label ?? this.cfg.baseUrl;
  }

  private url(path: string, params?: Record<string, string | number | undefined>): string {
    const base = this.cfg.baseUrl.replace(/\/?$/, "/");
    const u = new URL(path.replace(/^\//, ""), base);
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined && v !== "") u.searchParams.set(k, String(v));
    }
    return u.toString();
  }

  private async getJson<T>(url: string): Promise<T> {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`indexer ${this.label} → ${resp.status} for ${url}`);
    }
    return (await resp.json()) as T;
  }

  /** C4 — `GET /v1/health`. */
  async health(): Promise<IngestionStatus> {
    const body = await this.getJson<{
      latest_ledger?: number;
      ingested_through?: number;
      ingested_from?: number;
      lag_seconds?: number;
    }>(this.url("v1/health"));
    return {
      latestLedger: Number(body.latest_ledger ?? 0),
      ingestedThrough: Number(body.ingested_through ?? 0),
      ingestedFrom: Number(body.ingested_from ?? 0),
      lagSeconds: Number(body.lag_seconds ?? 0),
    };
  }

  /**
   * C2 + C3 — one page of ordered history. The `complete` flag is returned
   * verbatim; callers that replay events MUST honour it.
   */
  async orderedHistory(q: HistoryQuery): Promise<OrderedHistoryPage> {
    const body = await this.getJson<{
      events?: IndexerEventRow[];
      cursor?: string | null;
      complete?: boolean;
    }>(
      this.url(`v1/tokens/${q.contractId}/accounts/${q.account}/events`, {
        from_ledger: q.fromLedger,
        to_ledger: q.toLedger,
        types: q.types?.join(","),
        cursor: q.cursor,
        limit: q.limit ?? DEFAULT_PAGE_LIMIT,
      }),
    );

    const events: ConfidentialEvent[] = [];
    for (const row of body.events ?? []) {
      const ev = decodeIndexerRow(row);
      if (ev) events.push(ev);
    }

    // A missing `complete` is NOT treated as true. C3 is REQUIRED, so an
    // indexer that omits it is non-conformant, and the safe reading of silence
    // is "I cannot vouch for this range".
    return { events, cursor: body.cursor ?? null, complete: body.complete === true };
  }

  /**
   * Page through the whole requested range and return every event in order.
   *
   * @param requireComplete when true (the default), an incomplete range throws
   *   {@link IncompleteHistoryError} instead of returning a partial replay.
   */
  async fetchEvents(
    q: HistoryQuery,
    requireComplete = true,
  ): Promise<{ events: ConfidentialEvent[]; complete: boolean }> {
    const out: ConfidentialEvent[] = [];
    let cursor = q.cursor;
    let complete = true;

    for (;;) {
      const page = await this.orderedHistory({ ...q, cursor });
      out.push(...page.events);
      complete &&= page.complete;
      if (!page.cursor || page.cursor === cursor) break;
      cursor = page.cursor;
    }

    if (requireComplete && !complete) {
      throw new IncompleteHistoryError(this.label, q);
    }
    return { events: out, complete };
  }

  /**
   * C1 (RECOMMENDED) — the latest checkpoint at or before `atLedger`. Returns
   * `null` when the indexer has none, which is a legitimate answer: a client
   * falls back to scanning ordered history.
   */
  async checkpoint(
    contractId: string,
    account: string,
    atLedger: number,
  ): Promise<{ event: ConfidentialEvent | null; complete: boolean }> {
    const body = await this.getJson<{
      event?: IndexerEventRow | null;
      complete?: boolean;
    }>(
      this.url(`v1/tokens/${contractId}/accounts/${account}/checkpoint`, {
        at_ledger: atLedger,
      }),
    );
    return {
      event: body.event ? decodeIndexerRow(body.event) : null,
      complete: body.complete === true,
    };
  }
}

/**
 * Decode one INDEXER.md row into a {@link ConfidentialEvent} through the XDR
 * path shared with the RPC reader. Returns `null` for event types outside the
 * confidential-token family.
 */
export function decodeIndexerRow(row: IndexerEventRow): ConfidentialEvent | null {
  const topics = (row.topics_xdr ?? []).map((b64) => xdr.ScVal.fromXDR(b64, "base64"));
  if (topics.length === 0) return null;

  const name = topics[0]!.sym().toString();
  if (!KNOWN.has(name)) return null;

  const base = {
    ledger: Number(row.ledger_seq),
    txHash: row.tx_hash,
    cursor: naturalEventId({
      ledger: Number(row.ledger_seq),
      txHash: row.tx_hash,
      opIndex: Number(row.operation_index ?? 0),
      eventIndex: Number(row.event_index),
    }),
  };
  const addr = (i: number): string => Address.fromScVal(topics[i]!).toString();
  return buildConfidentialEvent(name, base, addr, dataMap(xdr.ScVal.fromXDR(row.data_xdr, "base64")));
}
