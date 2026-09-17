// Builds the data behind the picture: every rating this chain has, classified by where the
// money that produced it came from.
//
// Why a picture at all. The argument of this project is a comparison between two numbers that
// are three orders of magnitude apart (9,188 ratings, 16 of them backed by an arm's-length
// payment), and a table states that badly: the eye reads two rows and moves on. One dot per
// rating puts the ratio itself on the screen, which is the only honest way to show a ratio.
//
// One dot per rating, not per rater. A wallet that rated twice produced two entries in the
// registry's count, and the registry's count is exactly what is under examination here.
//
//   node src/farm-map.mjs   -> web/public/farm.json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const idx = JSON.parse(readFileSync("data/indexed.json", "utf8"));
const prov = JSON.parse(readFileSync("data/provenance.json", "utf8"));

const edge = (v) => (Array.isArray(v) ? v : v === undefined ? undefined : [v, null]);
const funded = new Map(idx.funded.map(([k, v]) => [k, edge(v)]));
const paid = new Map(idx.paid.map(([k, v]) => [k, edge(v)]));
const ownerOf = new Map(idx.registrations.map((r) => [r.agentId, r.owner]));

// The four ways a rating can come to exist, ordered from "the owner produced it" to "nothing
// about it is explained by money". `covered` marks the agents provenance was computed for; the
// rest are shown as unexamined rather than quietly folded into a bucket they were never tested
// against, which would be the same sleight of hand this project exists to point at.
const BUCKETS = [
  { key: "ownerFunded", label: "rater was funded by the agent's own owner" },
  { key: "paidAfter", label: "rater paid the agent, but only after rating it" },
  { key: "independent", label: "rater paid the agent before rating, and the owner never funded it" },
  { key: "noMoney", label: "no payment in either direction" },
  { key: "notCovered", label: "agent has fewer than five ratings, so provenance was not computed" },
];
const B = Object.fromEntries(BUCKETS.map((b, i) => [b.key, i]));

const covered = new Set(prov.agents.map((a) => a.agentId));
const firstRatingOf = new Map();          // `${agentId}|${wallet}` -> first ts that wallet rated it
for (const e of [...idx.feedback].sort((a, b) => a.ts - b.ts)) {
  const k = `${e.agentId}|${e.client}`;
  if (!firstRatingOf.has(k)) firstRatingOf.set(k, e.ts);
}

function bucketFor(agentId, wallet) {
  if (!covered.has(agentId)) return B.notCovered;
  const owner = ownerOf.get(agentId) ?? "";
  const ratedAt = firstRatingOf.get(`${agentId}|${wallet}`);
  const got = funded.get(`${owner}|${wallet}`);
  const sent = paid.get(`${wallet}|${owner}`);
  if (got !== undefined) return B.ownerFunded;
  if (sent === undefined) return B.noMoney;
  return sent[0] < ratedAt ? B.independent : B.paidAfter;
}

const byAgent = new Map();
for (const e of idx.feedback) {
  if (!byAgent.has(e.agentId)) byAgent.set(e.agentId, new Array(BUCKETS.length).fill(0));
  byAgent.get(e.agentId)[bucketFor(e.agentId, e.client)]++;
}

const provOf = new Map(prov.agents.map((a) => [a.agentId, a]));
const agents = [...byAgent.entries()]
  .map(([id, counts]) => ({
    id,
    owner: ownerOf.get(id) ?? null,
    total: counts.reduce((n, c) => n + c, 0),
    counts,
    verdict: provOf.get(id)?.verdict ?? null,
    first: provOf.get(id)?.first ?? null,
    last: provOf.get(id)?.last ?? null,
  }))
  .sort((a, b) => b.total - a.total);

const totals = BUCKETS.map((_, i) => agents.reduce((n, a) => n + a.counts[i], 0));

// The loop itself, measured rather than asserted: how long the owner's money took to come back,
// and how tightly that time clusters. A farm's signature is not that it is fast, it is that it
// is regular.
const a182 = provOf.get(182);
const loop = a182 ? {
  agentId: 182,
  wallets: a182.raters,
  monOut: a182.monOut, monBack: a182.monBack, monMedian: a182.monMedianOut,
  secondsToRating: a182.secondsFundingToRating,
  secondsToReturn: a182.secondsRatingToReturn,
} : null;

const out = {
  generatedAt: new Date().toISOString(),
  indexedAt: idx.indexedAt,
  buckets: BUCKETS,
  totals,
  ratings: idx.feedback.length,
  registrations: idx.registrations.length,
  ratedAgents: byAgent.size,
  independentWallets: prov.totals.independentWalletsNetworkWide,
  loop,
  agents,
};
mkdirSync("web/public", { recursive: true });
writeFileSync("web/public/farm.json", JSON.stringify(out));

console.log(`${out.ratings} ratings across ${out.ratedAgents} agents`);
BUCKETS.forEach((b, i) => console.log(
  `  ${String(totals[i]).padStart(5)}  ${(totals[i] / out.ratings * 100).toFixed(2).padStart(6)}%  ${b.label}`));
console.log(`-> web/public/farm.json`);
