#!/usr/bin/env node
// Cross-checks the two Envio pipelines: the hosted HyperIndex deployment against the provenance
// file the HyperSync pipeline wrote. Owner, rating count and distinct-rater count must agree on
// every covered agent; anything else is printed and the exit code is 1.
import { readFileSync } from "node:fs";

const ENDPOINT = process.env.HYPERINDEX_URL ?? "https://indexer.dev.hyperindex.xyz/6640c26/v1/graphql";
const query = "{ Agent(where:{feedbackCount:{_gte:5}}, limit: 1000){ id owner feedbackCount raterCount } "
  + "chain_metadata { latest_processed_block num_events_processed } }";
const res = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) });
const { data } = await res.json();
const theirs = new Map(data.Agent.map((a) => [Number(a.id), a]));
const ours = JSON.parse(readFileSync("data/provenance.json", "utf8")).agents;
const bad = ours.filter((a) => {
  const x = theirs.get(a.agentId);
  return !x || x.owner !== a.owner.toLowerCase() || x.feedbackCount !== a.feedback || x.raterCount !== a.raters;
});
const meta = data.chain_metadata[0];
console.log(`HyperIndex at block ${meta.latest_processed_block}, ${meta.num_events_processed} events; `
  + `covered agents: ours ${ours.length}, HyperIndex ${theirs.size}; disagreements: ${bad.length}`);
for (const a of bad) console.log(`  agent ${a.agentId}: ours ${a.feedback}/${a.raters}, HyperIndex `
  + `${theirs.get(a.agentId)?.feedbackCount ?? "-"}/${theirs.get(a.agentId)?.raterCount ?? "-"}`);
process.exit(bad.length || ours.length !== theirs.size ? 1 : 0);
