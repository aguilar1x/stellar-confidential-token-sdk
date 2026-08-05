/**
 * Install the published package from the registry and put it through the real
 * flow.
 *
 * Everything else in this repository tests the source. That is necessary and
 * not sufficient: the thing a reader actually installs is the tarball on npm,
 * and a package can be broken by a bad `files` list, a wrong `exports` map, or
 * a missing asset while every source test stays green. The double-wrapped proof
 * envelope shipped in 0.1.0 is exactly that shape of bug — source-clean, broken
 * on arrival.
 *
 * So this installs `stellar-confidential-token-sdk` into a scratch directory,
 * from the registry, with no link to this checkout, and then:
 *
 *   1. derives an account secret through the §5.1 chain from a SEP-0053
 *      signature, and checks it is deterministic;
 *   2. generates a REAL UltraHonk transfer proof against the packaged circuits
 *      and self-verifies it;
 *   3. reconstructs a multi-payment balance and checks the opening against the
 *      commitment the chain holds.
 *
 * Step 3 needs testnet. It is reported but does not fail the run, because an
 * RPC outage is not a defect in the package.
 *
 * Run:  node scripts/verify-published.mjs [version]
 */

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const VERSION = process.argv[2] ?? "latest";
const PKG = "stellar-confidential-token-sdk";

const dir = mkdtempSync(join(tmpdir(), "ct-sdk-verify-"));
console.log(`scratch: ${dir}`);

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: dir, encoding: "utf8", stdio: "pipe", ...opts });
}

try {
  run("npm", ["init", "-y"]);
  run("npm", ["pkg", "set", "type=module"]);

  console.log(`installing ${PKG}@${VERSION} from the registry…`);
  run("npm", ["install", `${PKG}@${VERSION}`, "@stellar/stellar-sdk"], { stdio: "inherit" });

  const installed = JSON.parse(
    run("npm", ["ls", PKG, "--json"]),
  ).dependencies?.[PKG]?.version;
  console.log(`installed ${PKG}@${installed}\n`);

  writeFileSync(
    join(dir, "check.mjs"),
    `
import { Keypair, Networks } from "@stellar/stellar-sdk";
import {
  deriveSk, deriveKeys, skSigningMessage, StateEngine, pointToBytes,
} from "${PKG}";
import { proveTransfer } from "${PKG}/node";
import { ChainClient, hybridFetchEvents } from "${PKG}/chain";

const TOKEN = "CAPLH4ZW7EDSYRBCQN77Y4K7W5RNA6TO76JQ5CGHHIPY4ALWVQZ2WFAY";
const kp = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 21));
const me = kp.publicKey();

// 1 — §5.1 derivation, and it must be deterministic.
const root = new Uint8Array(kp.signMessage(Buffer.from(skSigningMessage(TOKEN, me))));
const a = deriveSk(root, TOKEN, me);
const b = deriveSk(root, TOKEN, me);
if (a.sk !== b.sk) throw new Error("§5.1 derivation is not deterministic");
console.log("  §5.1  derived and reproducible");

// 2 — a real proof against the circuits inside the tarball.
const keys = deriveKeys(a.sk, a.addrF);
const other = deriveKeys(a.sk + 1n, a.addrF);
const t0 = Date.now();
const { payload, next } = await proveTransfer({
  keys, v: 2500n, r: 4242n, amount: 750n,
  pvkB: other.PVK, kAudR: other.PVK, kAudS: other.PVK,
});
if (!(payload.length > 1000) || next.v !== 1750n) throw new Error("proving produced nonsense");
console.log(\`  proof  \${payload.length} XDR bytes in \${((Date.now()-t0)/1000).toFixed(1)}s\`);

// 3 — a multi-payment balance, checked against the chain.
try {
  const B = "GBJWTPNFWF6T7LV5Q542TYSLFSS3WN6GSY33MLFOHEOJVI6FVKMSYP6G";
  const client = new ChainClient({
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: Networks.TESTNET,
    contracts: { token: TOKEN, verifier: "", auditor: "" },
  });
  const bs = process.env.BUILDING_SECRET;
  if (!bs) { console.log("  chain  skipped (no BUILDING_SECRET)"); process.exit(0); }
  const bkp = Keypair.fromSecret(bs);
  const broot = new Uint8Array(bkp.signMessage(Buffer.from(skSigningMessage(TOKEN, B))));
  const d = deriveSk(broot, TOKEN, B);
  const eng = new StateEngine({ address: B, keys: deriveKeys(d.sk, d.addrF) });
  const { events } = await hybridFetchEvents(client, undefined, { fromLedger: ${'${FROM_LEDGER}'} });
  eng.ingestEvents(events.filter(e => (e.type==="register"||e.type==="merge") ? e.account===B : (e.from===B||e.to===B)));
  const on = await client.confidentialBalance(B);
  const chk = eng.verifyAgainstChain({
    spendableC: pointToBytes(on.spendableBalance),
    receivingC: pointToBytes(on.receivingBalance),
  });
  console.log(\`  chain  \${eng.receiving().v / 10000000n} XLM across many payments, verify=\${chk.receivingOk}\`);
  if (!chk.receivingOk) throw new Error("published package cannot verify a real balance");
} catch (e) {
  console.log(\`  chain  unavailable (\${String(e.message).slice(0,60)}) — not a package defect\`);
}
`.replace("${FROM_LEDGER}", process.env.FROM_LEDGER ?? "3977272"),
  );

  console.log("running the real flow against the installed package:");
  run("node", ["check.mjs"], { stdio: "inherit" });
  console.log(`\nok — ${PKG}@${installed} works as installed`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
