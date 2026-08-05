/**
 * Browser-safe proving barrel. Re-exports ONLY `./prover.js` — `artifacts.ts`
 * and `ops.ts` reach `node:fs` (to load vendored circuits) and must be imported
 * directly by node-side callers/tests, never pulled into a browser bundle
 * through this barrel.
 */

export * from "./prover.js";
