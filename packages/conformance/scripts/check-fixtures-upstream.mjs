/**
 * Verify the vendored §6.1 fixtures are byte-identical to OpenZeppelin's.
 *
 * The fixtures are vendored so CI stays hermetic and the suite runs offline.
 * The cost of vendoring is that the copy can silently become a fork of the
 * specification — at which point the suite would keep passing against a
 * snapshot of what the spec used to say, which is a more convincing kind of
 * wrong than failing outright.
 *
 * This closes that gap: it fetches upstream and compares bytes. A difference is
 * not automatically an error in either direction — it means the spec moved and
 * a human has to decide what that implies — so the message says exactly that
 * rather than pretending the fix is mechanical.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..", "fixtures");

const UPSTREAM =
  "https://raw.githubusercontent.com/OpenZeppelin/stellar-contracts/main" +
  "/packages/tokens/src/confidential/circuits/lib/testdata";

const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

const files = readdirSync(FIXTURES).filter((f) => f.endsWith(".json")).sort();
if (files.length === 0) {
  console.error("No vendored fixtures found — the suite would be vacuous.");
  process.exit(1);
}

let drifted = 0;
let unreachable = 0;

for (const file of files) {
  const local = readFileSync(join(FIXTURES, file));

  let remote;
  try {
    const resp = await fetch(`${UPSTREAM}/${file}`);
    if (!resp.ok) {
      console.warn(`?  ${file.padEnd(38)} upstream returned ${resp.status}`);
      unreachable++;
      continue;
    }
    remote = Buffer.from(await resp.arrayBuffer());
  } catch (e) {
    console.warn(`?  ${file.padEnd(38)} unreachable: ${e?.message ?? e}`);
    unreachable++;
    continue;
  }

  if (local.equals(remote)) {
    console.log(`ok ${file.padEnd(38)} ${sha(local)}`);
  } else {
    console.error(
      `!! ${file.padEnd(38)} DRIFTED  local ${sha(local)} vs upstream ${sha(remote)}`,
    );
    drifted++;
  }
}

if (unreachable > 0) {
  // A network failure must not masquerade as a passing conformance check.
  console.error(`\n${unreachable} fixture(s) could not be fetched; treating as a failure.`);
}

if (drifted > 0) {
  console.error(
    `\n${drifted} fixture(s) differ from upstream.\n` +
      "This is not automatically a bug. It means the specification changed, and\n" +
      "someone has to decide what that means for this implementation:\n" +
      "  - re-vendor the file, then re-run the suite;\n" +
      "  - if a primitive now diverges, document it in src/divergences.js with\n" +
      "    its security consequence, rather than silencing the test.",
  );
}

process.exit(drifted > 0 || unreachable > 0 ? 1 : 0);
