// Buys the one fact about a rater that Monad alone cannot tell us: who funded it first,
// anywhere.
//
// Our own index answers "did the agent's owner fund this rater" by walking Monad transfers. It
// cannot answer "were these raters funded by the same wallet as each other", because the shared
// root may sit on another chain or predate the registry. Nansen sells exactly that primitive —
// /profiler/address/related-wallets returns a First Funder edge, $0.01 a call over x402 on Monad —
// and shared first-funder provenance is the detector the ERC-8004 Sybil literature settles on
// (arXiv 2606.26028 measures 73.5%, 59.2% and 90.6% coordinated reviewers on Ethereum, BSC, Base).
//
// So the purchase is an input to a verdict, not a panel to display. Cost is bounded and visible:
// one call per rater sampled, capped, cached forever because a first funder never changes.
//
//   node src/enrich-nansen.mjs <agentId> [--live] [--sample 5]
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const STORE = "data/enrichment.json";
const ENDPOINT = "https://api.nansen.ai/api/v1/profiler/address/related-wallets";

const agentId = Number(process.argv[2]);
const LIVE = process.argv.includes("--live");
const sampleArg = process.argv.indexOf("--sample");
const SAMPLE = sampleArg > -1 ? Number(process.argv[sampleArg + 1]) : 5;
if (!agentId) throw new Error("usage: enrich-nansen.mjs <agentId> [--live] [--sample N]");

const idx = JSON.parse(readFileSync("data/indexed.json", "utf8"));
const store = existsSync(STORE) ? JSON.parse(readFileSync(STORE, "utf8")) : { funders: {}, agents: {} };

const events = idx.feedback.filter((f) => f.agentId === agentId);
if (!events.length) throw new Error(`agent ${agentId} has no feedback in the index`);
const owner = idx.registrations.find((r) => r.agentId === agentId)?.owner ?? "";

// One entry per rater, earliest rating first: sampling the first raters rather than a random
// slice keeps the run reproducible and looks at the wallets that opened the campaign.
const raters = [...new Set(events.sort((a, b) => a.ts - b.ts).map((e) => e.client))];
const cached = raters.filter((r) => store.funders[r] !== undefined);
const toBuy = raters.filter((r) => store.funders[r] === undefined).slice(0, SAMPLE);

console.log(`agent #${agentId}: ${raters.length} distinct raters, ${cached.length} already known`);
console.log(`would buy ${toBuy.length} first-funder lookups at $0.01 = $${(toBuy.length * 0.01).toFixed(2)}`);
if (!LIVE) {
  console.log("dry run, nothing spent. re-run with --live");
  process.exit(0);
}

for (const [i, wallet] of toBuy.entries()) {
  process.stdout.write(`  [${i + 1}/${toBuy.length}] ${wallet.slice(0, 12)}… `);
  try {
    await run("node", ["src/buy-nansen.mjs", wallet, "--live"],
              { timeout: 90_000, env: { ...process.env, NANSEN_ENDPOINT: ENDPOINT, NANSEN_CHAIN: "monad" } });
    const rec = JSON.parse(readFileSync("data/purchases.jsonl", "utf8").trim().split("\n").pop());
    let funder = null, label = null;
    try {
      // The label is the half of this answer that matters most and the half we nearly threw
      // away: a shared first funder means a farm if the funder is an ordinary wallet, and means
      // nothing at all if it is an exchange or a bulk distributor that funds thousands.
      const row = (JSON.parse(rec.body ?? rec.bodyPreview).data ?? [])
        .find((r) => r.relation === "First Funder");
      funder = row?.address ?? null;
      label = row?.address_label ?? null;
    } catch {
      const m = (rec.body ?? rec.bodyPreview ?? "")
        .match(/"address":"(0x[0-9a-fA-F]{40})","address_label":"([^"]*)"/);
      if (m) { funder = m[1]; label = m[2]; }
    }
    store.funders[wallet] = funder;
    if (label) (store.labels ??= {})[funder] = label;
    console.log(funder
      ? `first funder ${funder.slice(0, 12)}…${label && !/^\[/.test(label.trim()) ? ` (${label.trim()})` : ""}`
      : "no funder on record");
  } catch (e) {
    console.log("failed:", String(e.message ?? e).slice(0, 80));
  }
}

// What the purchase buys us: do the raters trace back to one wallet, and is that wallet the
// agent's owner? Either answer is evidence; "no record" is neither and is reported as itself.
const known = raters.map((r) => store.funders[r]).filter((f) => f !== undefined);
const withFunder = known.filter(Boolean);
const counts = new Map();
for (const f of withFunder) counts.set(f, (counts.get(f) ?? 0) + 1);
const [topFunder, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
// "Most common funder" is not a shared funder when every rater has a different one. Taking the
// top of a table of ones used to report the arbitrary first entry as a finding, and if that entry
// happened to be the owner it announced a farm on an agent whose raters had three unrelated
// origins. Sharing requires more than one.
const shared = topCount > 1 ? topFunder : null;
const isOwner = (a) => a && owner && a.toLowerCase() === owner.toLowerCase();
// Counted separately, because "was funded by the owner" is a per-rater fact and does not need a
// shared root to matter: one owner-funded rater among three is a real and different finding.
const ownerFundedCount = withFunder.filter(isOwner).length;

const previous = store.agents[agentId];
store.agents[agentId] = {
  checkedAt: new Date().toISOString(),
  ratersSampled: known.length,
  withFirstFunder: withFunder.length,
  distinctFunders: counts.size,
  ownerFundedCount,
  sharedFunder: shared,
  sharedFunderCount: shared ? topCount : 0,
  sharedFunderLabel: shared ? (store.labels?.[shared] ?? null) : null,
  sharedFunderIsOwner: Boolean(shared && isOwner(shared)),
  // Nansen returns a label for every address, but for an unknown wallet that "label" is just its
  // own shortened address in brackets. Passing those through would let the service announce
  // "labelled [0x734b0e]" as if it had learned something.
  funderLabels: Object.fromEntries(
    [...counts.keys()]
      .map((f) => [f, store.labels?.[f] ?? null])
      // Zero-width padding (U+200B..U+200D, U+FEFF) is stripped before the test, and the
      // escapes are spelled out because invisible characters in source cannot be read or grepped.
      .filter(([, l]) => l && !/^\[0x[0-9a-fA-F]+\]$/.test(l.replace(/[\s\u200b-\u200d\ufeff]/g, "")))),
  // Cumulative, not per-run. A re-run that buys nothing must not report that this agent's
  // evidence was free; the money was spent whichever run spent it.
  usdcSpent: +((previous?.usdcSpent ?? 0) + toBuy.length * 0.01).toFixed(2),
};
mkdirSync("data", { recursive: true });
writeFileSync(STORE, JSON.stringify(store, null, 1));

const s = store.agents[agentId];
console.log(`\nsampled ${s.ratersSampled} raters: ${s.withFirstFunder} have a first funder on record, `
  + `${s.distinctFunders} distinct funder(s)`);
if (s.ownerFundedCount) {
  console.log(`  ${s.ownerFundedCount} of ${s.withFirstFunder} were funded first by the agent's own owner`);
}
for (const [f, l] of Object.entries(s.funderLabels ?? {})) {
  console.log(`  funder ${f.slice(0, 12)}… carries the label ${l.trim()}`);
}
if (s.sharedFunder) {
  console.log(`  ${s.sharedFunderCount} of them share the first funder ${s.sharedFunder}`
    + `${s.sharedFunderIsOwner ? ", which is the agent's own owner" : ""}`);
}
console.log(`  spent $${s.usdcSpent} on this agent`);
