// The verdict rules, on hand-built agents, so a change to the wording or the order of the checks
// cannot quietly change what an agent is called. Agent ids here are far above anything registered,
// so no data file colours the answer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict, uncovered } from "../src/verdict.mjs";

let next = 900_000_000;
const agent = (over) => ({
  agentId: next++, feedback: 10, raters: 10, ownerFunded: 0, independentPaid: 0, paidAfter: 0,
  sharedRaters: 0, sharedRaterShare: 0, ringAgents: 0, busiestDayShare: 0.2, ...over,
});

test("owner-funded raters and nobody paying first is farmed", () => {
  const v = verdict(agent({ ownerFunded: 10 }));
  assert.equal(v.verdict, "farmed");
  assert.equal(v.code, "FARMED");
  assert.match(v.why, /10 of 10 raters were funded by the agent's own owner/);
});

test("one paying rater who was never owner-funded lifts farmed to partly-backed", () => {
  assert.equal(verdict(agent({ ownerFunded: 9, independentPaid: 1 })).verdict, "partly-backed");
});

test("many ratings from one wallet are one opinion", () => {
  assert.equal(verdict(agent({ raters: 1, feedback: 12 })).verdict, "single-source");
});

test("shared raters with no money moving is a ring", () => {
  const v = verdict(agent({ raters: 8, sharedRaters: 7, sharedRaterShare: 0.875, ringAgents: 5 }));
  assert.equal(v.verdict, "ring");
  assert.match(v.why, /no money moved between them and the agent's owner in either direction/);
});

test("a ring with payments after rating does not claim no money moved", () => {
  const v = verdict(agent({ raters: 8, sharedRaters: 7, sharedRaterShare: 0.875, ringAgents: 5, paidAfter: 2 }));
  assert.equal(v.verdict, "ring");
  assert.doesNotMatch(v.why, /either direction/);
});

test("one busy wallet is not a ring: the five-rater floor holds", () => {
  const v = verdict(agent({ raters: 1, feedback: 3, sharedRaters: 1, sharedRaterShare: 1, ringAgents: 7 }));
  assert.notEqual(v.verdict, "ring");
});

test("a rater who paid first outranks ring structure", () => {
  const v = verdict(agent({ raters: 8, sharedRaters: 8, sharedRaterShare: 1, ringAgents: 5, independentPaid: 1 }));
  assert.equal(v.verdict, "partly-backed");
});

test("ratings landing on one day are a burst", () => {
  assert.equal(verdict(agent({ busiestDayShare: 0.9 })).verdict, "burst");
});

test("nothing payment-backed and no pattern is thin", () => {
  assert.equal(verdict(agent({})).verdict, "thin");
});

test("every verdict says what would change it and carries a code", () => {
  for (const over of [{ ownerFunded: 3 }, { raters: 1, feedback: 9 }, { independentPaid: 2 },
    { raters: 6, sharedRaters: 6, sharedRaterShare: 1, ringAgents: 3 }, { busiestDayShare: 0.95 }, {}]) {
    const v = verdict(agent(over));
    assert.ok(v.code && /^[A-Z_]+$/.test(v.code), `code for ${v.verdict}`);
    assert.ok(typeof v.wouldChange === "string" && v.wouldChange.length > 10, `wouldChange for ${v.verdict}`);
  }
});

test("an unregistered agent is told apart from a registered one", () => {
  const u = uncovered(999_999_999);
  assert.equal(u.registered, false);
  assert.equal(u.code, "NOT_REGISTERED");
  assert.match(u.why, /not registered/);
});
