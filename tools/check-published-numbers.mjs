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
  // Registrations grow every day while judging runs to 3 November, so the README says "over
  // 10,000" and points at /api/health instead of carrying a count that is stale by morning.
  "README.md": ["ratings", "independent ratings", "february share", "three-day share"],
  "agent-registration.json": ["ratings", "february share", "three-day share"],
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
    februaryShare: farm.februaryShare,
    threeDayShare: farm.busiestThreeDayShare,
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
  // Shares, not only counts: "86.6%" outlived the data that produced it by three weeks because
  // this list only knew about counts (found in the demo video, 2026-10-01).
  ["february share", live.februaryShare, [`${(live.februaryShare * 100).toFixed(1)}%`]],
  ["three-day share", live.threeDayShare, [`${(live.threeDayShare * 100).toFixed(1)}%`]],
];

// Numbers that look like our old figures, so a stale one is named rather than merely missing.
// Numbers that looked like our figures in an earlier draft. The agent id 10253 and the dated
// "10,253 to 10,254" sentence are history, not drift, so they are excluded by name.
const SUSPECTS = /\b(9,188|9188|1,206|10,24[0-9])\b/g;

// Bounds rather than exact counts. Judging runs three weeks and the counts move daily, so the
// published text says "over 9,300" and "about 97%"; what this checks is that each bound is still
// TRUE against the live API, which is the failure that matters to a reader.
const BOUNDS = [
  [/over (\d{1,3}(?:,\d{3})+)(?:\*\*)? ratings/g, (m) => live.ratings > Number(m[1].replace(/,/g, "")), "ratings"],
  [/16 of over (\d{1,3}(?:,\d{3})+)/g, (m) => live.independent === 16 && live.ratings > Number(m[1].replace(/,/g, "")), "16 of over"],
  [/about (\d{2})% of them from February/g, (m) => Math.abs(live.februaryShare * 100 - Number(m[1])) <= 0.5, "february share"],
  [/about (\d{2})% on three days/g, (m) => Math.abs(live.threeDayShare * 100 - Number(m[1])) <= 0.5, "three-day share"],
  [/about one in a hundred/g, () => Math.abs(live.ratedAgents / live.registrations - 0.01) <= 0.005, "rated share"],
];

let bad = 0;
for (const [file, expected] of Object.entries(FILES)) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const bounded = new Set();
  for (const [re, holds, label] of BOUNDS) {
    for (const m of text.matchAll(re)) {
      bounded.add(label);
      if (!holds(m)) { console.log(`🔴 ${file}: "${m[0]}" no longer holds against the live API`); bad++; }
    }
  }
  for (const [label, value, forms] of CHECKS) {
    if (bounded.has(label)) continue; // quoted as a bound, checked above
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
