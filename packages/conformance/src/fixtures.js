/**
 * SDK.md §6.1, primitive fixtures.
 *
 * "An implementation MUST reproduce every output in every file byte-for-byte."
 *
 * The spec is explicit that suites must READ the fixture files rather than
 * hardcode their values, "so changes to circuit output become test failures
 * rather than silent divergences". So this module loads the vendored JSON at
 * runtime and derives its test cases from whatever is in them. Adding a vector
 * upstream adds a case here automatically; changing one turns into a failure
 * instead of a quiet disagreement.
 *
 * Comparison is on the zero-padded 32-byte hex, not on bigints. `0x0a` and
 * `0xa` are the same number and NOT the same fixture output, byte-for-byte is
 * the standard the spec sets, so that is the standard used here.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = join(HERE, "..", "fixtures");

/** Every fixture file, as `{ name, path, doc }`, sorted for stable ordering. */
export function loadFixtures() {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => ({
      name: file.replace(/\.json$/, ""),
      path: join(FIXTURE_DIR, file),
      doc: JSON.parse(readFileSync(join(FIXTURE_DIR, file), "utf8")),
    }));
}

/** Canonical 32-byte big-endian hex, lowercase, `0x`-prefixed. */
export function hex32(value) {
  const n = typeof value === "bigint" ? value : BigInt(value);
  if (n < 0n) throw new Error(`negative field element: ${n}`);
  return `0x${n.toString(16).padStart(64, "0")}`;
}

/**
 * Normalize a fixture's expected output to the same canonical form.
 * Handles the three shapes in use: a field element, a point `{x, y}`, and a
 * two-element array (the `sponge_squeeze_2` pair).
 */
export function canonical(output) {
  if (Array.isArray(output)) return output.map(hex32);
  if (output && typeof output === "object") {
    return { x: hex32(output.x), y: hex32(output.y) };
  }
  return hex32(output);
}
