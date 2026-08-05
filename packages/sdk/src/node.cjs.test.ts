/**
 * CJS require smoke (Z2.14). Guards two regressions:
 *
 *  1. `require('stellar-confidential-token-sdk')` must NOT crash at import. The main barrel is
 *     browser-safe (no node:fs), so its CJS build has no top-level
 *     `import.meta.url` → `fileURLToPath(undefined)` crash.
 *  2. `require('stellar-confidential-token-sdk/node').loadCircuit` must be a function and resolve
 *     vendored circuits under CJS — the `shims: true` polyfill makes
 *     `import.meta.url` work in the node subpath's CJS output.
 *
 * These exercise the BUILT `dist/*.cjs`, so they only pass after `npm run build`.
 * Skipped (with a warning) if the dist bundle isn't built yet.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const built = existsSync(join(pkgDir, "dist", "index.cjs"));

function runNode(script: string): string {
  return execFileSync(process.execPath, ["-e", script], {
    cwd: pkgDir,
    encoding: "utf8",
  }).trim();
}

describe.skipIf(!built)("CJS require smoke", () => {
  it("require('stellar-confidential-token-sdk') does not throw and exposes the browser barrel", () => {
    const out = runNode(
      "const z=require('stellar-confidential-token-sdk'); console.log(typeof z.CircuitProver, typeof z.verifyDisclosure);",
    );
    expect(out).toBe("function function");
  });

  it("require('stellar-confidential-token-sdk/node').loadCircuit resolves a vendored circuit", () => {
    const out = runNode(
      "const z=require('stellar-confidential-token-sdk/node'); console.log(typeof z.loadCircuit, typeof z.loadCircuit('register').bytecode);",
    );
    expect(out).toBe("function string");
  });
});
