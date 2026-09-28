#!/usr/bin/env node
/**
 * Compare the numbers printed in our own prose against what the service is serving right now.
 *
 * The index refreshes daily, so every figure in the README, in the submission text and in the
 * video captions has a shelf life. This has already bitten twice: a published bill went stale
 * after a reconciliation, and a rating count went stale the same week it was quoted into a video
 * script. A service whose whole argument is "numbers you can recompute" cannot be the one shipping
 * numbers nobody rechecked.
 *
 *   node tools/check-published-numbers.mjs            # exits 1 if anything drifted
 */
import { readFileSync } from "node:fs";

const BASE = process.env.DEMO_BASE ?? "https://prooflines.org/monad/agent-trust";
// Which figures each file is expected to carry. Demanding every number everywhere would train
// the reader to ignore this tool: the registration card deliberately avoids counts that move
// daily, and its disclosure sentence quotes a dated historical pair on purpose.
const FILES = {
  "README.md": ["registrations", "ratings", "rated agents", "independent ratings"],
  "agent-registration.json": ["ratings"],
};

const group = (n) => n.toLocaleString("en-US");

const live = await (async () => {
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  const farm = await fetch(`${BASE}/farm.json`).then((r) => r.json());
  const buckets = Object.fromEntries(farm.buckets.map((b, i) => [b.key, farm.totals[i]]));
  return {
    registrations: health.totals.registrations,
    ratings: health.totals.feedbackEvents,
    ratedAgents: health.totals.ratedAgents,
    covered: health.totals.agentsCovered,
    independent: buckets.independent,
    ownerFunded: buckets.ownerFunded,
  };
})();

// Each check is a label, the live value, and the shapes that value is written in our prose.
const CHECKS = [
  ["registrations", live.registrations, [group(live.registrations), String(live.registrations)]],
  ["ratings", live.ratings, [group(live.ratings), String(live.ratings)]],
  ["rated agents", live.ratedAgents, [String(live.ratedAgents)]],
  ["covered agents", live.covered, [String(live.covered)]],
  ["independent ratings", live.independent, [String(live.independent)]],
  ["owner-funded ratings", live.ownerFunded, [group(live.ownerFunded), String(live.ownerFunded)]],
];

// Numbers that look like our old figures, so a stale one is named rather than merely missing.
// Numbers that looked like our figures in an earlier draft. The agent id 10253 and the dated
// "10,253 to 10,254" sentence are history, not drift, so they are excluded by name.
const SUSPECTS = /\b(9,188|9188|1,206|10,24[0-9])\b/g;

let bad = 0;
for (const [file, expected] of Object.entries(FILES)) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const [label, value, forms] of CHECKS) {
    const mentioned = forms.some((f) => text.includes(f));
    // Only complain when the file talks about this figure at all: the registration card does not
    // quote every number, and demanding it would train everyone to ignore this tool.
    if (expected.includes(label) && !mentioned) {
      console.log(`🔴 ${file}: ${label} is now ${value}, and that number is not in the text`);
      bad++;
    }
  }
  const stale = [...new Set(text.match(SUSPECTS) ?? [])].filter(
    (s) => !CHECKS.some(([, , forms]) => forms.includes(s)),
  );
  if (stale.length) console.log(`⚠️  ${file}: possibly stale figures present: ${stale.join(", ")}`);
}

console.log(
  `\nживое сейчас: регистраций ${group(live.registrations)}, отзывов ${group(live.ratings)}, ` +
    `оценённых ${live.ratedAgents}, покрыто ${live.covered}, независимых ${live.independent}`,
);
process.exit(bad ? 1 : 0);
