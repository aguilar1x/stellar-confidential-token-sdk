/**
 * Node-only {@link StateStore} backed by a JSON file. Ported from the demo's
 * `state/json-store.ts`. Kept OUT of the package barrel so the browser bundle
 * never pulls in `node:fs`. Import it directly by subpath:
 * `import { JsonFileStore } from "stellar-confidential-token-sdk/state/json-store"` (Z2.14 wires
 * the node subpath; until then, import from source).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

import type { AccountState } from "./types.js";
import { bigintReplacer, reviveState, type StateStore } from "./store.js";

export class JsonFileStore implements StateStore {
  constructor(private path: string) {}

  #readAll(): Record<string, unknown> {
    if (!existsSync(this.path)) return {};
    return JSON.parse(readFileSync(this.path, "utf8")) as Record<string, unknown>;
  }

  async load(address: string): Promise<AccountState | null> {
    const raw = this.#readAll()[address] as Record<string, unknown> | undefined;
    return raw ? reviveState(raw) : null;
  }

  async save(address: string, state: AccountState): Promise<void> {
    const all = this.#readAll();
    all[address] = state;
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(all, bigintReplacer, 2));
  }
}
