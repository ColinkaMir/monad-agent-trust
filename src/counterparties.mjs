// Buys Nansen's counterparty view of the wallets a verdict hangs on, and says what it shows.
//
// Why this endpoint: our index walks the owner's transfers ON MONAD, and the ring pass asks the
// chain who sent the raters their first MON. Both are blind to the same thing: money that moved
// on any other chain. Nansen's /profiler/address/counterparties answers across chains, so it is
// bought for exactly two kinds of address and no others:
//   - the owner of every agent the service calls farmed or ring, to see whether the raters show
//     up among the owner's counterparties when every chain Nansen covers is in view;
//   - the shared funder of a ring (three wallets or more), to see whom it paid, in what, and with
//     which tools.
// At $0.05 a call it is five times the basic tier, which is why it is scoped to the addresses a
// verdict already points at instead of the whole registry.
//
// The separate /profiler/address/labels endpoint would have been the direct way to ask "is this
// funder an exchange". It is not sold over x402 ("API key required. This endpoint does not support
// paid access", checked 2026-10-01), so labels here are the ones Nansen attaches to each
// counterparty inside this response.
//
//   node src/counterparties.mjs            # dry run: what would be bought, and for how much
//   node src/counterparties.mjs --live     # buy what is missing, then summarise
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const LIVE = process.argv.includes("--live");
const ENDPOINT = "https://api.nansen.ai/api/v1/profiler/address/counterparties";
const API = process.env.AGENT_TRUST_API ?? "http://127.0.0.1:8460";
const STORE = "data/counterparties.json";
const LEDGER = "data/purchases.jsonl";
const PRICE = 0.05;

const lc = (s) => String(s ?? "").toLowerCase();
// Nansen labels an unknown wallet with its own shortened address in brackets, padded with
// zero-width characters. That is not a label and must never be quoted as one.
const realLabels = (ls) => (ls ?? [])
  .map((l) => l.replace(/[​-‍﻿]/g, "").trim())
  .filter((l) => l && !/^\[0x[0-9a-fA-F]+\]$/.test(l));

// The verdicts come from the running service, so this script and the API can never disagree
// about which agents are farmed or ring.
const { agents } = await fetch(`${API}/agents`).then((r) => r.json());
const idx = JSON.parse(readFileSync("data/indexed.json", "utf8"));
const rings = existsSync("data/ring-funders.json")
  ? JSON.parse(readFileSync("data/ring-funders.json", "utf8")).agents ?? {} : {};

const selected = agents.filter((a) => a.verdict === "farmed" || a.verdict === "ring");
const targets = new Map(); // address -> why it is bought
for (const a of selected) {
  targets.set(lc(a.owner), "owner");
  const f = rings[a.agentId];
  // Same floor the ring verdict uses before it names a funder: one shared funder among two
  // wallets is a coincidence.
  if (a.verdict === "ring" && f?.topFunder && f.topFunderWallets >= 3) targets.set(lc(f.topFunder), "ring funder");
}

// What has already been bought, from the ledger itself, so a rerun spends nothing twice.
const bought = new Map();
if (existsSync(LEDGER)) {
  for (const line of readFileSync(LEDGER, "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(line);
    if (r.endpoint === ENDPOINT && r.delivered) bought.set(lc(r.about), r);
  }
}
const missing = [...targets.keys()].filter((t) => !bought.has(t));
console.log(`${selected.length} agents are farmed or ring; ${targets.size} addresses to look at, `
  + `${targets.size - missing.length} already bought, ${missing.length} to buy at $${PRICE} `
  + `= $${(missing.length * PRICE).toFixed(2)}`);
// Without --live nothing is bought, but the summary is still rebuilt from what was bought
// before, so the daily refresh keeps it in step with the verdicts at no cost.
if (!LIVE && missing.length) console.log("not buying without --live; summarising what is already bought");

for (const addr of LIVE ? missing : []) {
  process.stdout.write(`  ${targets.get(addr)} ${addr.slice(0, 12)}… `);
  try {
    await run("node", ["src/buy-nansen.mjs", addr, "--live"],
              { timeout: 120_000, env: { ...process.env, NANSEN_ENDPOINT: ENDPOINT } });
    const rec = JSON.parse(readFileSync(LEDGER, "utf8").trim().split("\n").pop());
    if (rec.delivered && lc(rec.about) === addr) { bought.set(addr, rec); console.log("ok"); }
    else console.log(`not delivered (HTTP ${rec.httpStatus})`);
  } catch (e) {
    console.log("failed:", String(e.message ?? e).slice(0, 80));
  }
}

// One compact record per address: what Nansen returned, without the bulk we never read.
const addresses = {};
for (const [addr, rec] of bought) {
  if (!targets.has(addr)) continue;
  const body = JSON.parse(rec.body);
  addresses[addr] = {
    role: targets.get(addr),
    boughtAt: rec.at,
    tx: rec.tx,
    // A page of 1,000 that is not the last one is a sample of the counterparties, and every
    // statement built on it has to say so.
    complete: Boolean(body.pagination?.is_last_page),
    rows: (body.data ?? []).map((x) => ({
      address: lc(x.counterparty_address),
      labels: realLabels(x.counterparty_address_label),
      interactions: x.interaction_count,
      inUsd: x.volume_in_usd ?? 0,
      outUsd: x.volume_out_usd ?? 0,
      tokens: [...new Set((x.tokens_info ?? []).map((t) => t.token_symbol))],
    })),
  };
}

// Owner -> rater MON transfers our own index already found, keyed the way score.mjs keys them,
// so "Nansen agrees with the index" is checked wallet by wallet rather than by equal counts.
const fundedPairs = new Set(idx.funded.map(([k]) => k));
const ratersOf = (id) => new Set(idx.feedback.filter((f) => f.agentId === id).map((f) => lc(f.client)));
const summary = {};
for (const a of selected) {
  const raters = ratersOf(a.agentId);
  const own = addresses[lc(a.owner)];
  if (!own) continue;
  const ownMap = new Map(own.rows.map((r) => [r.address, r]));
  const s = {
    verdict: a.verdict,
    owner: lc(a.owner),
    ownerCounterparties: own.rows.length,
    ownerComplete: own.complete,
    ratersAmongOwnerCounterparties: [...raters].filter((r) => ownMap.has(r)).length,
    raters: raters.size,
  };
  if (a.verdict === "farmed") {
    const byIndex = [...raters].filter((r) => fundedPairs.has(`${lc(a.owner)}|${r}`));
    const byNansen = [...raters].filter((r) => ownMap.has(r));
    // Same wallets, not just the same number: only meaningful on a complete counterparty list.
    s.matchesIndex = own.complete && byIndex.length === byNansen.length
      && byIndex.every((r) => ownMap.has(r));
  }
  const f = rings[a.agentId];
  // The funder is only read when the ring pass itself named it (three wallets or more). An
  // address can be in the store for another reason, as some other agent's owner, and reading it
  // here would attach a funder to a ring that never had one worth naming.
  const fun = f?.topFunder && f.topFunderWallets >= 3 ? addresses[lc(f.topFunder)] : null;
  if (a.verdict === "ring" && fun) {
    const funMap = new Map(fun.rows.map((r) => [r.address, r]));
    // "Paid" means money went OUT of the funder to the rater, in Nansen's direction convention.
    const paid = [...raters].map((r) => funMap.get(r)).filter((r) => r && r.outUsd > 0);
    s.funder = lc(f.topFunder);
    s.funderComplete = fun.complete;
    s.funderPaidRaters = paid.length;
    s.funderTokens = [...new Set(paid.flatMap((r) => r.tokens))].sort();
    // Bulk-send tools are named because they say how the paying was done, not what it means.
    s.funderBulkTools = [...new Set(fun.rows.flatMap((r) => r.labels).filter((l) => /disperse/i.test(l)))];
    // A direct transfer either way between owner and funder. Shared counterparties do not
    // count: bridges, token contracts and airdrop spam are shared by half the chain.
    s.ownerFunderDirect = ownMap.has(lc(f.topFunder)) || funMap.has(lc(a.owner));
  }
  summary[a.agentId] = s;
}

const out = {
  generatedAt: new Date().toISOString(),
  source: ENDPOINT,
  pricePerCallUsdc: PRICE,
  scope: "owners of agents whose verdict is farmed or ring, and ring funders covering 3+ raters",
  addresses,
  agents: summary,
};
writeFileSync(STORE, JSON.stringify(out, null, 1) + "\n");
for (const [id, s] of Object.entries(summary)) {
  console.log(`#${id} ${s.verdict}: ${s.ratersAmongOwnerCounterparties}/${s.raters} raters among the owner's `
    + `${s.ownerCounterparties}${s.ownerComplete ? "" : "+"} counterparties`
    + (s.funder ? `; funder paid ${s.funderPaidRaters} in ${s.funderTokens.join(", ")}`
      + `${s.funderBulkTools.length ? ` via ${s.funderBulkTools.join(", ")}` : ""}`
      + `; direct owner-funder transfer: ${s.ownerFunderDirect}` : ""));
}
