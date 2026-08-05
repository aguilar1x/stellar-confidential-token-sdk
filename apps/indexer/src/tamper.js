/**
 * Deliberately dishonest indexers, for demonstrating the client's defences.
 *
 * INDEXER.md §7 scopes indexer trust to "availability and completeness only —
 * never confidentiality or integrity". This module builds the adversaries that
 * scoping implies, so the claim can be tested instead of asserted.
 *
 * Three modes, and they are caught by different things — which is the point:
 *
 *   honest-gap  a real gap, honestly reported. C3 catches it: the client
 *               refuses the range before replaying anything.
 *   omit        an event silently dropped while still claiming complete: true.
 *               C3 CANNOT catch this — the indexer is lying, and a completeness
 *               flag is only as good as the party asserting it. The on-chain
 *               commitment check catches it.
 *   corrupt     an event's ciphertext altered, still claiming complete: true.
 *               Same: only the commitment check catches it.
 *
 * That layering is the whole argument. A client that trusts `complete` is safe
 * against an honest-but-lagging archive and defenceless against a hostile one.
 * Verifying reconstructed openings against the chain is what makes the indexer
 * untrusted rather than merely monitored.
 */

import { xdr } from "@stellar/stellar-sdk";

/**
 * Alter one field of an event's data map, keeping it perfectly well-formed.
 *
 * Flipping raw bytes in the base64 would usually produce something that fails
 * to decode, which any client rejects for the wrong reason. A decodable event
 * carrying a wrong value is the honest test: nothing is malformed, nothing
 * looks suspicious, and only checking against the chain reveals it.
 */
function corruptField(dataXdr, fieldName) {
  const val = xdr.ScVal.fromXDR(dataXdr, "base64");
  const entries = val.map();
  if (!entries) return dataXdr;

  for (const entry of entries) {
    if (entry.key().sym().toString() !== fieldName) continue;
    const bytes = new Uint8Array(entry.val().bytes());
    if (bytes.length === 0) continue;
    // Nudge the last byte. The result is still a canonical field element, just
    // not the one the sender committed to.
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] + 1) & 0xff;
    entry.val(xdr.ScVal.scvBytes(Buffer.from(bytes)));
    return val.toXDR("base64");
  }
  return dataXdr;
}

/**
 * Wrap a store so it serves a dishonest view.
 *
 * @param {import("./store.js").MemoryStore} store
 * @param {object} opts
 * @param {"honest-gap"|"omit"|"corrupt"} opts.mode
 * @param {string} [opts.eventName] which event family to attack (default `merge`
 *   for `omit`, `transfer` for `corrupt`)
 * @param {string} [opts.field] which data field to corrupt (default `b_tilde`,
 *   the sender's encrypted post-transfer balance)
 */
export function dishonestStore(store, { mode, eventName, field = "b_tilde" }) {
  const target = eventName ?? (mode === "omit" ? "merge" : "transfer");

  // A Proxy keeps every honest behaviour and overrides only what the chosen
  // adversary changes, so the demo cannot accidentally pass by being crippled
  // in some unrelated way.
  return new Proxy(store, {
    get(t, prop, recv) {
      if (mode === "honest-gap" && prop === "isComplete") {
        // Truthfully admits it cannot vouch for anything.
        return () => false;
      }

      if (mode !== "honest-gap" && prop === "isComplete") {
        // Lies: claims a gap-free history unconditionally.
        return () => true;
      }

      if (mode === "omit" && prop === "query") {
        return (args) => {
          const res = Reflect.get(t, prop, recv).call(t, args);
          return { ...res, events: res.events.filter((ev) => ev.event_name !== target) };
        };
      }

      if (mode === "corrupt" && prop === "query") {
        return (args) => {
          const res = Reflect.get(t, prop, recv).call(t, args);
          return {
            ...res,
            events: res.events.map((ev) =>
              ev.event_name === target
                ? { ...ev, data_xdr: corruptField(ev.data_xdr, field) }
                : ev,
            ),
          };
        };
      }

      const v = Reflect.get(t, prop, recv);
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
}
