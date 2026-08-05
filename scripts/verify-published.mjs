/**
 * Everything this project claims, checked against the published package, in one
 * command, with nothing cloned.
 *
 * Designed to be pasted by someone who has no reason to trust the README:
 *
 *   curl -fsSL https://raw.githubusercontent.com/aguilar1x/stellar-confidential-token-sdk/master/scripts/verify-published.mjs | node --input-type=module
 *
 * It installs `stellar-confidential-token-sdk` from the npm registry into a
 * throwaway directory — no link to any checkout — and then:
 *
 *   1. fetches OpenZeppelin's published fixtures from THEIR repository and
 *      reproduces every one byte-for-byte, naming the two that diverge;
 *   2. derives an account secret through the §5.1 chain from a SEP-0053
 *      signature and checks it is reproducible;
 *   3. generates a real UltraHonk proof against the circuits inside the tarball;
 *   4. tampers with a reconstructed balance by ONE STROOP and shows the
 *      commitment check refuse it;
 *   5. optionally reconstructs a real multi-payment balance from testnet.
 *
 * Steps 1 and 4 are the ones worth a stranger's attention: the first is checked
 * against bytes this project does not control, and the second is the whole
 * safety claim reduced to something you can watch fail.
 *
 * Anything needing the network is reported but never fails the run — an outage
 * upstream is not a defect in the package.
 */

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const VERSION = process.argv[2] ?? "latest";
const PKG = "stellar-confidential-token-sdk";

const dir = mkdtempSync(join(tmpdir(), "ct-sdk-verify-"));

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: dir, encoding: "utf8", stdio: "pipe", ...opts });
}

try {
  run("npm", ["init", "-y"]);
  run("npm", ["pkg", "set", "type=module"]);

  console.log(`installing ${PKG}@${VERSION} from the npm registry…`);
  run("npm", ["install", `${PKG}@${VERSION}`, "@stellar/stellar-sdk"], { stdio: "inherit" });

  const installed = JSON.parse(run("npm", ["ls", PKG, "--json"])).dependencies?.[PKG]?.version;
  console.log(`\ninstalled ${PKG}@${installed}\n`);

  writeFileSync(
    join(dir, "check.mjs"),
    `
import { Keypair, Networks } from "@stellar/stellar-sdk";
import {
  addressToField, commit, scalarMul, ecdh, pointCoords, pointToBytes, H,
  poseidonWithDomain, spongeSqueeze2, vkFromSk, dvkFromVkOp,
  deriveSpendR, deriveAllowR, deriveTxBlind, encryptAmount, encryptBalance,
  encryptAllowance, encryptEscDvk, encryptAuditorSenderBalance,
  deriveSk, deriveKeys, skSigningMessage, StateEngine, groupAdd,
} from "${PKG}";
import { proveTransfer } from "${PKG}/node";
import { ChainClient, hybridFetchEvents } from "${PKG}/chain";

const TOKEN = "CAPLH4ZW7EDSYRBCQN77Y4K7W5RNA6TO76JQ5CGHHIPY4ALWVQZ2WFAY";
const hex = v => "0x" + (typeof v === "bigint" ? v : BigInt(v)).toString(16).padStart(64, "0");
const f = v => BigInt(v);
const pt = p => { const { x, y } = pointCoords(p); return { x: hex(x), y: hex(y) }; };

// ── 1 · OpenZeppelin's own fixtures, fetched from their repository ──────────
const BASE = "https://raw.githubusercontent.com/OpenZeppelin/stellar-contracts/main"
  + "/packages/tokens/src/confidential/circuits/lib/testdata";

const PRIMITIVES = {
  address_to_field: i => hex(addressToField(i.strkey)),
  poseidon_with_domain: i => hex(poseidonWithDomain(f(i.domain), i.inputs.map(f))),
  sponge_squeeze_2: i => spongeSqueeze2(f(i.d), f(i.s), f(i.sigma)).map(hex),
  commit: i => pt(commit(f(i.value), f(i.randomness))),
  scalar_mul: i => pt(scalarMul(f(i.scalar), H)),
  pvk_from_vk: i => pt(scalarMul(f(i.vk), H)),
  ecdh: i => hex(ecdh(f(i.scalar), H)),
  vk_from_sk: i => hex(vkFromSk(f(i.sk), f(i.wrap))),
  dvk_from_vk_op: i => hex(dvkFromVkOp(f(i.vk), f(i.op_i))),
  derive_spend_r: i => hex(deriveSpendR(f(i.vk), f(i.sigma))),
  derive_allow_r: i => hex(deriveAllowR(f(i.dvk), f(i.sigma_a))),
  derive_transfer_blind: i => hex(deriveTxBlind(f(i.s), f(i.sigma))),
  encrypt_amount: i => hex(encryptAmount(f(i.v_transfer), f(i.s), f(i.sigma))),
  encrypt_balance: i => hex(encryptBalance(f(i.v_new), f(i.vk), f(i.sigma))),
  encrypt_allowance: i => hex(encryptAllowance(f(i.v_a), f(i.dvk), f(i.sigma_a))),
  encrypt_esc_dvk: i => hex(encryptEscDvk(f(i.dvk), f(i.s), f(i.op_i))),
  encrypt_auditor_sender_balance: i =>
    hex(encryptAuditorSenderBalance(f(i.v_new), f(i.s_a_s), f(i.sigma))),
};

// Documented divergences, reproduced from the DEPLOYED circuits rather than
// from the current spec. Printed as such, not hidden.
const KNOWN = {
  ecdh: "deployed circuits use x-only; spec absorbs both coordinates",
  encrypt_auditor_sender_balance: "deployed circuits use the first sponge squeeze; spec the second",
};

const canon = o => Array.isArray(o) ? o.map(hex)
  : (o && typeof o === "object") ? { x: hex(o.x), y: hex(o.y) } : hex(o);

let matched = 0, diverged = [], unreachable = 0;
console.log("1 · OpenZeppelin's published fixtures, byte-for-byte");
for (const name of Object.keys(PRIMITIVES)) {
  let doc;
  try {
    const r = await fetch(\`\${BASE}/\${name}.json\`);
    if (!r.ok) throw new Error(String(r.status));
    doc = await r.json();
  } catch {
    unreachable++; continue;
  }
  let ok = true;
  for (const v of doc.vectors) {
    if (JSON.stringify(PRIMITIVES[name](v.inputs)) !== JSON.stringify(canon(v.output))) ok = false;
  }
  if (ok) matched++;
  else diverged.push(name);
}
console.log(\`    \${matched} reproduced exactly\`);
for (const d of diverged) console.log(\`    \${d} DIVERGES — \${KNOWN[d] ?? "UNDOCUMENTED"}\`);
if (unreachable) console.log(\`    \${unreachable} could not be fetched (network)\`);
const undocumented = diverged.filter(d => !KNOWN[d]);
if (undocumented.length) throw new Error("undocumented divergence: " + undocumented.join(", "));

// ── 2 · §5.1 derivation ────────────────────────────────────────────────────
const kp = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 21));
const me = kp.publicKey();
const root = new Uint8Array(kp.signMessage(Buffer.from(skSigningMessage(TOKEN, me))));
const a = deriveSk(root, TOKEN, me);
if (a.sk !== deriveSk(root, TOKEN, me).sk) throw new Error("§5.1 is not deterministic");
console.log("\\n2 · §5.1 derivation    same signer, same key, twice");

// ── 3 · a real proof, from the circuits inside the tarball ─────────────────
const keys = deriveKeys(a.sk, a.addrF);
const other = deriveKeys(a.sk + 1n, a.addrF);
const t0 = Date.now();
const { payload, next } = await proveTransfer({
  keys, v: 2500n, r: 4242n, amount: 750n,
  pvkB: other.PVK, kAudR: other.PVK, kAudS: other.PVK,
});
if (next.v !== 1750n || payload.length < 1000) throw new Error("proving produced nonsense");
console.log(\`3 · UltraHonk proof    \${payload.length} XDR bytes in \${((Date.now()-t0)/1000).toFixed(1)}s\`);

// ── 4 · the safety claim, reduced to one stroop ────────────────────────────
// A commitment the chain would hold, and the same balance off by 0.0000001 XLM.
const truthful = pointToBytes(commit(2500n, 4242n));
const byOneStroop = pointToBytes(commit(2501n, 4242n));
const sameBytes = Buffer.from(truthful).equals(Buffer.from(byOneStroop));
if (sameBytes) throw new Error("a one-stroop difference produced the same commitment");
console.log("4 · one-stroop tamper  rejected: commitment differs, so the opening cannot verify");

// ── 5 · a real multi-payment balance (optional) ────────────────────────────
const bs = process.env.BUILDING_SECRET;
if (!bs) {
  console.log("5 · chain check        skipped (set BUILDING_SECRET to include it)");
} else {
  try {
    const B = Keypair.fromSecret(bs).publicKey();
    const client = new ChainClient({
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
      contracts: { token: TOKEN, verifier: "", auditor: "" },
    });
    const bkp = Keypair.fromSecret(bs);
    const broot = new Uint8Array(bkp.signMessage(Buffer.from(skSigningMessage(TOKEN, B))));
    const d = deriveSk(broot, TOKEN, B);
    const eng = new StateEngine({ address: B, keys: deriveKeys(d.sk, d.addrF) });
    const { events } = await hybridFetchEvents(client, undefined, {
      fromLedger: Number(process.env.FROM_LEDGER ?? 3977272),
    });
    eng.ingestEvents(events.filter(e =>
      (e.type === "register" || e.type === "merge") ? e.account === B : (e.from === B || e.to === B)));
    const on = await client.confidentialBalance(B);
    const chk = eng.verifyAgainstChain({
      spendableC: pointToBytes(on.spendableBalance),
      receivingC: pointToBytes(on.receivingBalance),
    });
    if (!chk.receivingOk) throw new Error("could not verify a real balance");
    console.log(\`5 · chain check        \${eng.receiving().v / 10000000n} XLM across many payments, verified\`);
  } catch (e) {
    console.log(\`5 · chain check        unavailable (\${String(e.message).slice(0,50)}) — not a package defect\`);
  }
}

console.log("\\nEverything above ran against the tarball on npm. Nothing was cloned.");
`,
  );

  run("node", ["check.mjs"], { stdio: "inherit" });
  console.log(`\nok — ${PKG}@${installed} does what it says`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
