/**
 * Node-only loader for the vendored compiled circuits. Kept out of the browser
 * barrel ({@link ./index.ts}) because it reads from the filesystem; the browser
 * build (Z5) supplies circuits through its own vendored-artifact path.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { CompiledCircuit } from "@noir-lang/noir_js";

/** The vendored compiled circuits, including the two selective-disclosure ones. */
export type CircuitName =
  | "register"
  | "withdraw"
  | "transfer"
  | "disclose_recipient"
  | "disclose_sender";

/**
 * Locate the vendored `circuits/` dir relative to THIS module. The relative
 * depth differs between the source layout (`src/proving/artifacts.ts`, two
 * levels down from the package root, used by vitest) and the bundled output
 * (`dist/node.{js,cjs}`, one level down, used by consumers). Walk up from this
 * file until a sibling `circuits/` dir is found rather than hard-coding a depth.
 */
function resolveCircuitsDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "circuits");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fall back to the source-layout depth for a clear error if nothing matched.
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "circuits");
}

const circuitsDir = resolveCircuitsDir();

export function loadCircuit(name: CircuitName): CompiledCircuit {
  return JSON.parse(readFileSync(join(circuitsDir, `${name}.json`), "utf8")) as CompiledCircuit;
}

/** The two selective-disclosure circuits that ship a pinned `.vk.json`. */
export type DisclosureCircuitName = "disclose_recipient" | "disclose_sender";

/**
 * Load the pinned UltraHonk verification key for a disclosure circuit, returned
 * as the raw VK bytes (base64-decoded `vkBase64`). This is what
 * `verifyDisclosure`'s `ctx.pinnedVk` expects: bb.js `getVerificationKey({keccak:true})`
 * is byte-compared against it. The `.vk.json` files live in `circuits/vks/`
 * alongside the core circuits' `.vk.bin` (mirrors the demo's `artifacts/` layout).
 */
export function loadDisclosureVk(name: DisclosureCircuitName): Uint8Array {
  const json = JSON.parse(
    readFileSync(join(circuitsDir, "vks", `${name}.vk.json`), "utf8"),
  ) as { vkBase64: string };
  return new Uint8Array(Buffer.from(json.vkBase64, "base64"));
}
