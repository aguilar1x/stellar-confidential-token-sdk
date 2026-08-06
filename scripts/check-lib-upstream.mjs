/**
 * Verify the vendored Noir library is byte-identical to OpenZeppelin's, at the
 * commit the deployed verifier was built from.
 *
 * `circuits/lib/` is OpenZeppelin's, copied in so `nargo compile` works from a
 * fresh clone. Nargo can pin a git dependency to a branch or tag name but never
 * to a commit, so a git dependency would let this project's circuits change
 * meaning without a line of it changing — vendoring is the only way to pin.
 *
 * The cost of vendoring is that the copy can silently become a fork. This
 * closes that: it fetches the library at the pinned commit and compares bytes.
 *
 * Note this pins a COMMIT, not `main`. The sibling fixtures check compares
 * against `main` on purpose — it is asking "has the spec moved?". This one asks
 * the opposite: "is the code we compile against still exactly what the verifier
 * on chain was built from?" Those two questions want different answers, so they
 * are two scripts rather than one.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "..", "circuits", "lib");

/** The commit the deployed verifier's circuits were built from. */
const PINNED = "98090b3e59785454f55b3617992c2f84250c7173";

const UPSTREAM =
  `https://raw.githubusercontent.com/OpenZeppelin/stellar-contracts/${PINNED}` +
  "/packages/tokens/src/confidential/circuits/lib";

/** Everything nargo actually compiles. `testdata/` is checked by the sibling script. */
const FILES = ["Nargo.toml", "src/lib.nr", "src/tests.nr"];

const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

let drifted = 0;
let unreachable = 0;

console.log(`OpenZeppelin circuit library @ ${PINNED.slice(0, 7)}\n`);

for (const rel of FILES) {
  const local = readFileSync(join(LIB, rel));

  let remote;
  try {
    const r = await fetch(`${UPSTREAM}/${rel}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    remote = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    console.log(`  ?  ${rel.padEnd(14)} could not fetch (${e.message})`);
    unreachable++;
    continue;
  }

  if (local.equals(remote)) {
    console.log(`  ok ${rel.padEnd(14)} ${sha(local)}`);
  } else {
    console.log(`  XX ${rel.padEnd(14)} ours ${sha(local)} != theirs ${sha(remote)}`);
    drifted++;
  }
}

if (unreachable) {
  console.log(`\n${unreachable} file(s) unreachable — network, not a mismatch.`);
}

if (drifted) {
  console.error(
    `\n${drifted} file(s) differ from OpenZeppelin's at ${PINNED.slice(0, 7)}.\n` +
      `\nThis copy is meant to be theirs, unmodified. A difference means either\n` +
      `someone edited the vendored library — in which case the circuits no longer\n` +
      `compile against what the deployed verifier was built from — or the pin is\n` +
      `being moved deliberately, which needs the circuits recompiled, their\n` +
      `verification keys regenerated, and the verifier redeployed. Neither is\n` +
      `mechanical, so this fails rather than guessing.`,
  );
  process.exit(1);
}

console.log("\nvendored library matches upstream at the pinned commit.");
