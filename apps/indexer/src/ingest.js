/**
 * Soroban RPC → store ingestion.
 *
 * Events are stored as the XDR the RPC served, never as a decoded form. The
 * client decodes them with the same XDR path it uses for live RPC reads, so an
 * archived event and its live twin are byte-identical. Decoding here would fork
 * that path and let the two sources disagree — which reconstructs a wrong
 * balance without anything looking broken.
 *
 * The indexer's reason to exist is that the RPC keeps only about seven days.
 * Whatever is ingested while it is inside that window stays available forever
 * after it ages out.
 */

import { Address, xdr } from "@stellar/stellar-sdk";
import { cursorLedger, rpcEventCoords } from "stellar-confidential-token-sdk/chain";

/** Event families the confidential-token protocol emits. */
/** Bound on scan calls per ingest pass, so a pathological cursor cannot spin. */
const MAX_SCAN_CALLS = 500;

const KNOWN = new Set(["register", "deposit", "merge", "withdraw", "transfer"]);

/** Which topic positions hold participant addresses, per event family. */
const PARTICIPANT_TOPICS = {
  register: [1],
  merge: [1],
  deposit: [1, 2],
  withdraw: [1, 2],
  transfer: [1, 2],
};

function toStored(raw, contractId) {
  const topics = raw.topic ?? [];
  if (topics.length === 0) return null;

  let name;
  try {
    name = topics[0].sym().toString();
  } catch {
    return null;
  }
  if (!KNOWN.has(name)) return null;

  const participants = [];
  for (const i of PARTICIPANT_TOPICS[name] ?? []) {
    if (topics[i]) {
      try {
        participants.push(Address.fromScVal(topics[i]).toString());
      } catch {
        /* a malformed topic simply yields no participant */
      }
    }
  }

  // An RPC event id is `<toid>-<eventOrder>`, where the operation index lives
  // in the low bits of the toid — NOT two plain numbers. Parsing it any other
  // way yields events whose cursor no longer matches the RPC's for the same
  // event, and the hybrid source stops deduping them. Reuse the SDK's parser
  // so there is exactly one definition of that mapping.
  const { opIndex, eventIndex } = rpcEventCoords(String(raw.id ?? "0-0"));

  return {
    contract_id: contractId,
    event_name: name,
    ledger_seq: raw.ledger,
    tx_hash: raw.txHash ?? "",
    operation_index: opIndex,
    event_index: eventIndex,
    topics_xdr: topics.map((t) => t.toXDR("base64")),
    data_xdr: (raw.value ?? xdr.ScVal.scvVoid()).toXDR("base64"),
    participants,
  };
}

/**
 * Page the RPC's `getEvents` over `[fromLedger, head]` and record both the
 * events and the range examined.
 *
 * @param {object} args
 * @param {import("@stellar/stellar-sdk").rpc.Server} args.server
 * @param {import("./store.js").MemoryStore} args.store
 * @param {string} args.contractId
 * @param {number} args.fromLedger
 */
export async function ingestFromRpc({ server, store, contractId, fromLedger }) {
  const health = await server.getHealth();
  const head = health.latestLedger;
  const oldest = health.oldestLedger ?? fromLedger;

  // Asking below the retention floor is rejected by the RPC, so the honest
  // start is the floor — and the range we then claim to have examined must
  // start there too, never at the ledger we wished we could read.
  const start = Math.max(fromLedger, oldest);
  if (start > head) return { ingested: 0, from: start, to: head };

  const collected = [];
  let cursor;
  // `getEvents` scans a bounded slice of ledgers per call, so an EMPTY page
  // with a cursor means "nothing in this slice, keep going" — not "done".
  // Treating an empty page as the end is why a cold start from the retention
  // floor silently finds nothing: the first slice is usually quiet, and the
  // scan stops before ever reaching the ledgers that matter.
  for (let calls = 0; calls < MAX_SCAN_CALLS; calls++) {
    const page = await server.getEvents(
      cursor
        ? { filters: [{ type: "contract", contractIds: [contractId] }], cursor, limit: 100 }
        : {
            startLedger: start,
            filters: [{ type: "contract", contractIds: [contractId] }],
            limit: 100,
          },
    );
    for (const raw of page.events ?? []) {
      const ev = toStored(raw, contractId);
      if (ev) collected.push(ev);
    }
    // Done when the scan cursor has caught up with the chain head; the other
    // two conditions are defensive (no cursor, or no forward progress).
    if (!page.cursor) break;
    if (cursorLedger(page.cursor) >= (page.latestLedger ?? head)) break;
    if (page.cursor === cursor) break;
    cursor = page.cursor;
  }

  store.ingest(collected, start, head, head);
  return { ingested: collected.length, from: start, to: head };
}
