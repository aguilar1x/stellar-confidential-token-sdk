/**
 * Rebuild the two selective-disclosure circuits and the artifacts the SDK ships.
 *
 * These are this project's own circuits (OpenZeppelin publishes the disclosure
 * specification, not an implementation), so unlike the core circuits there is
 * no upstream artifact to copy — they have to be built here, and the SDK's
 * `DOMAIN.DISCLOSURE` has to agree with what they absorb.
 *
 * That agreement was broken for two releases because nothing rebuilt them and
 * nothing executed them: `disclosure.test.ts` stubbed `Noir.execute`, so the
 * client was only ever checked against itself. This script exists so the
 * rebuild is one command rather than a sequence of `bb` flags someone has to
 * remember — `--oracle_hash keccak` in particular, which is not the default and
 * silently produces a key the SDK will not match.
 *
 * Run after ANY change to circuits/, then run the SDK tests: the real-circuit
 * cases in disclosure.test.ts are what prove client and circuit still agree.
 *
 *   npm run circuits && npm test --workspace=stellar-confidential-token-sdk
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const CIRCUITS = join(ROOT, "circuits");
const SHIPPED = join(ROOT, "packages", "sdk", "circuits");

const NAMES = ["disclose_sender", "disclose_recipient"];

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function toolVersion(cmd, args) {
  try {
    return run(cmd, args).trim();
  } catch {
    console.error(
      `\n${cmd} is not on PATH. The supported toolchain is nargo 1.0.0-beta.11 + bb 0.87.0;\n` +
        `anything else may produce a verification key the SDK's pin rejects.`,
    );
    process.exit(1);
  }
}

const nargoV = toolVersion("nargo", ["--version"]);
const bbV = toolVersion("bb", ["--version"]);
const noirVersion = (nargoV.match(/noirc version = (\S+)/) ?? [])[1] ?? "unknown";

console.log(`nargo  ${nargoV.split("\n")[0]}`);
console.log(`bb     ${bbV}\n`);

for (const name of NAMES) {
  const dir = join(CIRCUITS, name);
  if (!existsSync(dir)) {
    console.error(`missing circuit source: ${dir}`);
    process.exit(1);
  }

  run("nargo", ["compile"], dir);

  const artifact = join(dir, "target", `${name}.json`);

  // `--oracle_hash keccak` is mandatory and is NOT the default: the SDK proves
  // with bb.js under `{ keccak: true }`, and a Poseidon-transcript key would
  // verify nothing it produces while looking perfectly well-formed.
  run("bb", [
    "write_vk",
    "--oracle_hash",
    "keccak",
    "-b",
    artifact,
    "-o",
    join(dir, "target"),
    "--output_format",
    "bytes",
  ]);

  const vk = readFileSync(join(dir, "target", "vk"));

  const before = existsSync(join(SHIPPED, "vks", `${name}.vk.json`))
    ? JSON.parse(readFileSync(join(SHIPPED, "vks", `${name}.vk.json`), "utf8")).vkBase64
    : null;
  const vkBase64 = vk.toString("base64");

  writeFileSync(join(SHIPPED, `${name}.json`), readFileSync(artifact));
  writeFileSync(
    join(SHIPPED, "vks", `${name}.vk.json`),
    JSON.stringify(
      { circuitId: name, scheme: "ultra_honk", oracleHash: "keccak", noirVersion, vkBase64 },
      null,
      2,
    ) + "\n",
  );

  const changed = before !== null && before !== vkBase64;
  console.log(`  ${name.padEnd(19)} vk ${vk.length}B${changed ? "  (CHANGED)" : ""}`);
}

console.log(
  "\nArtifacts written to packages/sdk/circuits/." +
    "\nRun the SDK tests now — the real-circuit cases are what prove the client agrees.",
);
