// Turns the indexed events into the only trust numbers on this chain that a farm cannot fake
// by spending its own money.
//
// The score everyone reaches for first is "weight feedback by whether the rater paid the
// agent". On Monad that score is worse than useless: on agent #182 all 7,665 raters had paid
// the owner, and all 7,665 had been funded by that same owner seconds earlier. Two filters
// survive contact with the data, and only together:
//
//   paid BEFORE rating    — a customer pays, then judges; a farm is paid to judge
//   not funded by owner   — money that came from the agent's own owner proves nothing
import { readFileSync, writeFileSync } from "node:fs";

const idx = JSON.parse(readFileSync("data/indexed.json", "utf8"));
const funded = new Map(idx.funded);   // `${owner}|${wallet}` -> first ts owner funded wallet
const paid = new Map(idx.paid);       // `${wallet}|${owner}` -> first ts wallet paid owner
const ownerOf = new Map(idx.registrations.map((r) => [r.agentId, r.owner]));

const byAgent = new Map();
for (const f of idx.feedback) {
  if (!byAgent.has(f.agentId)) byAgent.set(f.agentId, []);
  byAgent.get(f.agentId).push(f);
}
const day = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);

const agents = [];
for (const [agentId, events] of byAgent) {
  if (events.length < idx.minFeedback) continue;
  const owner = ownerOf.get(agentId) ?? "";
  events.sort((a, b) => a.ts - b.ts);

  const firstRating = new Map();                 // a wallet that rated twice is one rater
  for (const e of events) if (!firstRating.has(e.client)) firstRating.set(e.client, e.ts);
  const perClient = new Map();
  for (const e of events) perClient.set(e.client, (perClient.get(e.client) ?? 0) + 1);
  const days = new Map();
  for (const e of events) days.set(day(e.ts), (days.get(day(e.ts)) ?? 0) + 1);

  let ownerFunded = 0, paidBefore = 0, paidAfter = 0, fullCycle = 0, selfRated = 0;
  // Keep the wallets, not just the count. Summing per-agent counts across the network silently
  // counts one wallet once per agent it rated, and on this chain that is not hypothetical: a
  // single wallet is the entire independent record of two different agents.
  const independentWallets = [];
  for (const [wallet, ratedAt] of firstRating) {
    if (wallet === owner) selfRated++;
    const gotFromOwner = funded.get(`${owner}|${wallet}`);
    const sentToOwner = paid.get(`${wallet}|${owner}`);
    if (gotFromOwner !== undefined) ownerFunded++;
    if (sentToOwner !== undefined) (sentToOwner < ratedAt ? paidBefore++ : paidAfter++);
    if (gotFromOwner !== undefined && sentToOwner !== undefined) fullCycle++;
    if (sentToOwner !== undefined && sentToOwner < ratedAt && gotFromOwner === undefined) {
      independentWallets.push(wallet);
    }
  }
  const independentPaid = independentWallets.length;

  agents.push({
    agentId, owner,
    feedback: events.length,
    raters: firstRating.size,
    topRaterShare: +(Math.max(...perClient.values()) / events.length).toFixed(4),
    busiestDayShare: +(Math.max(...days.values()) / events.length).toFixed(4),
    first: day(events[0].ts), last: day(events[events.length - 1].ts),
    selfRated, ownerFunded, fullCycle, paidBefore, paidAfter, independentPaid, independentWallets,
  });
}
agents.sort((a, b) => b.feedback - a.feedback);

const out = {
  generatedAt: new Date().toISOString(),
  indexedAt: idx.indexedAt,
  source: idx.source,
  covers: `agents with at least ${idx.minFeedback} feedback events`,
  method:
    "For each rated agent we read every native transfer touching the agent owner and ask two "
    + "questions the registry cannot answer: did the rating wallet pay the agent BEFORE it rated, "
    + "and had the owner funded that wallet in the first place. A payment on its own proves "
    + "nothing: on the most-rated agent every rater had paid, and every rater had been funded.",
  totals: {
    registrations: idx.registrations.length,
    feedbackEvents: idx.feedback.length,
    ratedAgents: byAgent.size,
    agentsCovered: agents.length,
    // Ratings and wallets are different numbers and the gap is the point: the same wallet is the
    // whole independent record of two separate agents, so adding per-agent counts overstates how
    // many independent parties exist on this chain.
    independentPaidRatings: agents.reduce((n, a) => n + a.independentPaid, 0),
    independentPaidWalletsNetworkWide:
      new Set(agents.flatMap((a) => a.independentWallets)).size,
  },
  agents,
};
writeFileSync("data/provenance.json", JSON.stringify(out, null, 1));

console.log(`${out.totals.registrations} registrations, ${out.totals.feedbackEvents} feedback events`);
console.log(`${out.totals.ratedAgents} agents rated, ${agents.length} covered`);
console.log(`independent paid ratings across the whole network: ${out.totals.independentPaidRatings}, `
  + `from ${out.totals.independentPaidWalletsNetworkWide} distinct wallet(s)\n`);
console.log("agent     feedback  raters  owner-funded  full-cycle  paid-before  independent  window");
for (const a of agents.slice(0, 12)) {
  console.log(`#${String(a.agentId).padEnd(8)}${String(a.feedback).padEnd(10)}${String(a.raters).padEnd(8)}`
    + `${String(a.ownerFunded).padEnd(14)}${String(a.fullCycle).padEnd(12)}${String(a.paidBefore).padEnd(13)}`
    + `${String(a.independentPaid).padEnd(13)}${a.first} … ${a.last}`);
}
