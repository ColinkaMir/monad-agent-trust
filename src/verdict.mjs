// The verdict, in one place. serve.mjs (HTTP) and mcp.mjs (MCP) both answer "can this agent be
// trusted", and they used to carry separate copies of this logic; the MCP copy quietly fell a
// leg behind (no ring funder) while the HTTP one moved on. Two answers to one question is the
// drift this project exists to point out in other people's numbers, so there is one copy now.
import { readFileSync, existsSync, statSync } from "node:fs";

/// Who funded the raters of a ring, from src/ring-funders.mjs. Separate from the provenance pass
/// because that one walks agent OWNERS, and the whole point of a ring is that the money came from
/// somebody who owns none of these agents.
export const ringFunders = () =>
  existsSync("data/ring-funders.json")
    ? JSON.parse(readFileSync("data/ring-funders.json", "utf8"))
    : { agents: {} };

/// Nansen's counterparty view of an owner and of a ring's funder, from src/counterparties.mjs.
/// Bought only for agents already called farmed or ring, at $0.05 an address.
export const counterparties = () =>
  existsSync("data/counterparties.json")
    ? JSON.parse(readFileSync("data/counterparties.json", "utf8"))
    : { agents: {} };

const listTokens = (t) => t.length < 2 ? t.join("") : `${t.slice(0, -1).join(", ")} and ${t.at(-1)}`;

/// What the counterparty purchase says about this agent, in words, with its own limits. Separate
/// from corroboration() because it answers a different question: not "who funded each rater
/// first" but "does money between the owner, the raters and a ring's funder show up anywhere,
/// on any chain Nansen covers".
export function counterpartyCheck(a) {
  const s = counterparties().agents?.[a.agentId];
  if (!s) return { bought: false };
  const scope = s.ownerComplete
    ? `the owner's complete list of ${s.ownerCounterparties} counterparties`
    : `the first ${s.ownerCounterparties.toLocaleString("en-US")} of the owner's counterparties (Nansen holds more)`;
  const base = { bought: true, endpoint: "profiler/address/counterparties", chains: "all",
                 usdcPerAddress: 0.05, ownerCounterparties: s.ownerCounterparties,
                 ownerComplete: s.ownerComplete,
                 ratersAmongOwnerCounterparties: s.ratersAmongOwnerCounterparties };
  if (s.verdict === "farmed") {
    // Agreement is only claimed where it was measured: a full counterparty list whose rater count
    // equals what our Monad index found. A partial page can confirm the pattern, not the total.
    const agrees = s.matchesIndex === true;
    return { ...base, finding: `${scope} ${s.ownerComplete ? "includes" : "include"} ${s.ratersAmongOwnerCounterparties} of the `
      + `${s.raters} raters, across every chain Nansen covers. `
      + (agrees
        ? `${s.ratersAmongOwnerCounterparties === 1 ? "It is the same wallet" : "They are the same wallets"} `
          + "our Monad index finds, so a second source agrees and no rater "
          + "funded by the owner on another chain was missed."
        : `Our Monad index finds ${a.ownerFunded}; a single page cannot show them all, so this `
          + "confirms the pattern rather than the count.") };
  }
  const out = { ...base };
  const parts = [];
  parts.push(s.ratersAmongOwnerCounterparties === 0
    ? `none of the ${s.raters} raters appear among ${scope}`
    : `${s.ratersAmongOwnerCounterparties} of the ${s.raters} raters appear among ${scope}`);
  if (s.funder) {
    Object.assign(out, { funder: s.funder, funderPaidRaters: s.funderPaidRaters,
                         funderTokens: s.funderTokens, funderBulkTools: s.funderBulkTools,
                         ownerFunderDirect: s.ownerFunderDirect });
    const tools = s.funderBulkTools.length ? ` (it also used ${s.funderBulkTools.map((t) => t.replace(/^🤖\s*/, "")).join(", ")})` : "";
    parts.push(`the shared funder paid ${s.funderPaidRaters} of them in ${listTokens(s.funderTokens)}${tools}`);
    parts.push(s.ownerFunderDirect
      ? "and the owner and that funder did transfer to each other directly"
      : "and no transfer between the owner and that funder appears in either list");
  }
  out.finding = `Across every chain Nansen covers: ${parts.join(", ")}.`;
  return out;
}

/// The purchased half of the verdict. Our own index can say the owner funded a rater ON MONAD;
/// Nansen's first-funder edge says who funded it first ANYWHERE, which is the question a farm
/// would have to defeat on every chain at once.
export function corroboration(e) {
  // Say what is missing rather than returning nothing: without a bought first-funder edge the
  // owner-funding question is answered from Monad alone, and Monad alone cannot see a rater that
  // was funded on some other chain. That gap is the reason the purchase exists.
  if (!e) return {
    bought: false,
    gap: "not bought for this agent, so the owner-funding answer here sees only Monad and would "
       + "miss a rater funded on another chain",
  };
  const base = { bought: true, usdcSpent: e.usdcSpent, ratersSampled: e.ratersSampled };
  // Nansen pads labels with zero-width characters; they are invisible in a browser and turn into
  // noise in a JSON client, so they come off before the label is quoted anywhere.
  const clean = (l) => l.replace(/[\u200b-\u200d\ufeff]/g, "").trim();
  const labels = Object.entries(e.funderLabels ?? {})
    .map(([f, l]) => `${f.slice(0, 10)}… is labelled ${clean(l)}`);
  const withLabels = (finding) => labels.length ? { ...base, finding, labels } : { ...base, finding };

  if (e.withFirstFunder === 0) {
    return { ...base, finding: "no first-funder record for the sampled raters, so this half is "
                             + "simply unknown." };
  }
  if (e.ownerFundedCount === e.withFirstFunder) {
    return withLabels(`every one of the ${e.withFirstFunder} sampled raters was first funded by the `
      + `agent's own owner. Bought from Nansen, independent of our Monad index.`);
  }
  if (e.ownerFundedCount > 0) {
    return withLabels(`${e.ownerFundedCount} of ${e.withFirstFunder} sampled raters were first `
      + `funded by the agent's own owner, and the rest were not, so this is a mixed record rather `
      + `than a farm.`);
  }
  if (e.sharedFunder) {
    return withLabels(`${e.sharedFunderCount} of ${e.withFirstFunder} sampled raters share one `
      + `first funder (${e.sharedFunder}), which is the shape of a funded cluster rather than a `
      + `crowd.`);
  }
  // "Unrelated origins" is a statement about a crowd and says nothing about a single wallet, so
  // a sample of one gets the narrower claim it actually supports.
  if (e.withFirstFunder === 1) {
    return withLabels("the one rater sampled was not first funded by the agent's owner. That is "
      + "the whole of what was bought here, and one wallet is not a crowd.");
  }
  // A label here is the difference between a finding and a false alarm: unrelated origins mean
  // something quite different when one of those origins is a wallet that funds thousands.
  return withLabels(`${e.distinctFunders} distinct first funders across ${e.withFirstFunder} `
    + `sampled raters, which is what unrelated origins look like.`);
}

/// Who sent each rating, from src/senders.mjs: ratings written by a transaction from somebody other
/// than the rater, and how many of those came from the rated agent's own owner.
export const senders = () =>
  existsSync("data/senders.json")
    ? JSON.parse(readFileSync("data/senders.json", "utf8"))
    : { agents: {} };

/// The sentence and the field for ratings the owner sent itself. Added to whatever the verdict is
/// rather than becoming a verdict of its own: it is a fact about how the ratings were written,
/// and on the agents where it occurs the verdict already says the record is not earned.
export function ownerSent(agentId) {
  const s = senders().agents?.[agentId];
  if (!s?.ownerSent) return null;
  return {
    field: { ratings: s.ownerSent, of: s.ratings, example: s.example },
    sentence: ` ${s.ownerSent} of its ${s.ratings} ratings were sent by the agent's own owner, as a `
      + `transaction from the owner to the rater's account, so they were written on the owner's own `
      + `initiative.`,
  };
}

/// Plain-language reading of the numbers. Deliberately blunt: the point of the project is that
/// a count of ratings means nothing here, so the verdict says why rather than scoring 0-100.
export function verdict(a) {
  const v = baseVerdict(a);
  const o = a && ownerSent(a.agentId);
  const p = a && puppetOf(a.agentId);
  return {
    ...v,
    ...(o && { ownerSentRatings: o.field }),
    ...(p && { ownerFundedToRate: p.field }),
    why: v.why + (o ? o.sentence : "") + (p ? p.sentence : ""),
  };
}

function baseVerdict(a) {
  if (!a) return { verdict: "unknown", why: "no feedback on this agent at all" };
  if (a.ownerFunded > 0 && a.independentPaid === 0) {
    return {
      verdict: "farmed",
      why: `${a.ownerFunded} of ${a.raters} raters were funded by the agent's own owner, and no `
         + `rater paid the agent before rating it. The rating count is self-produced.`,
    };
  }
  if (a.raters === 1 && a.feedback >= 5) {
    return { verdict: "single-source",
      why: `all ${a.feedback} ratings come from one wallet, so this is one opinion repeated.` };
  }
  if (a.independentPaid > 0) {
    return { verdict: "partly-backed",
      why: `${a.independentPaid} rater(s) paid this agent before rating it and were never funded `
         + `by its owner. That is the only part of the record money cannot fake.` };
  }
  // A ring: the same small set of wallets rating this agent and several others, with no payment
  // in either direction. This is the shape of the 27 September wave (20 wallets, 12 agents, five
  // hours, zero MON moved) and it is invisible to every filter above, because those filters follow
  // money and here there is none. Ordered AFTER the payment checks on purpose: a rater who paid
  // before rating is evidence, and evidence outranks structure.
  //
  // The floor of five raters is not decoration. Agent #145 has one rater who also rated seven
  // other agents, which is 100% overlap and means nothing: one busy wallet is not a ring.
  if (a.independentPaid === 0 && a.ownerFunded === 0 && a.raters >= 5 && a.sharedRaterShare >= 0.5) {
    // The verdict's own conditions rule out owner funding and paying before rating, but not paying
    // after it, so "either direction" is only said when the data says it.
    let why = `${a.sharedRaters} of ${a.raters} raters also rated ${a.ringAgents} other agents, and `
            + (a.paidAfter === 0
              ? `no money moved between them and the agent's owner in either direction. `
              : `the owner funded none of them and none paid before rating. `)
            + `The ratings are shared out among a small set of `
            + `wallets rather than earned.`;
    // Second leg, when the chain supports it: who paid for those wallets in the first place. Only
    // stated when it covers at least three of them, because one shared funder among two wallets is
    // a coincidence and saying otherwise would be the overreach this project objects to.
    const f = ringFunders().agents?.[a.agentId];
    if (f?.topFunder && f.topFunderWallets >= 3) {
      const when = f.fundingWindow?.[0] === f.fundingWindow?.[1]
        ? `on ${f.fundingWindow[0]}`
        : `between ${f.fundingWindow?.[0]} and ${f.fundingWindow?.[1]}`;
      why += ` ${f.topFunderWallets} of the ${f.fundedOnMonad} that ever received MON were funded `
           + `by one address, ${f.topFunder.slice(0, 10)}…, ${when}, which is months before they `
           + `rated anything. That address owns none of these agents, so the owner-funding check `
           + `never sees it.`;
    }
    // Third leg, bought: the funder's own counterparties show what MON alone cannot, that the
    // same wallet paid these raters on other chains too, and the owner's show whether the money
    // ever touched the owner. Only quoted when the funder above was named.
    const c = counterparties().agents?.[a.agentId];
    if (c?.funder && f?.topFunder && f.topFunderWallets >= 3) {
      const offMon = c.funderTokens.filter((t) => t !== "MON");
      why += ` Nansen's counterparty data, bought across chains, shows the same address paying `
           + `${c.funderPaidRaters} of the ${c.raters} raters`
           + (offMon.length ? `, in ${listTokens(offMon)} as well as MON` : "")
           // Nansen shows the tool among the funder's counterparties, not which payments went
           // through it, so the sentence says it was used and stops there.
           + (c.funderBulkTools.length ? `, and the same address also used a bulk-send tool` : "")
           + (c.ownerFunderDirect
             ? "; it also transacted with the owner directly."
             : `; ${c.ratersAmongOwnerCounterparties === 0 ? "none of the raters, and " : ""}no `
               + "transfer to or from that funder, appear among the owner's counterparties.");
    }
    return { verdict: "ring", why };
  }
  if (a.busiestDayShare > 0.8) {
    return { verdict: "burst",
      why: `${Math.round(a.busiestDayShare * 100)}% of all ratings landed on one day, which is an `
         + `event rather than a history.` };
  }
  return { verdict: "thin", why: "ratings exist but nothing in them is payment-backed." };
}

// The registry as indexed, reduced to what an uncovered answer needs. Read once per index refresh
// (the file is a few megabytes, and the API serves many questions between refreshes).
let registryCache = { mtimeMs: -1, owners: new Map(), counts: new Map(), puppets: new Map(), indexedAt: null, minimum: 5 };
function registry() {
  if (!existsSync("data/indexed.json")) return registryCache;
  const mtimeMs = statSync("data/indexed.json").mtimeMs;
  if (mtimeMs === registryCache.mtimeMs) return registryCache;
  const d = JSON.parse(readFileSync("data/indexed.json", "utf8"));
  const owners = new Map(d.registrations.map((r) => [r.agentId, r.owner]));
  const counts = new Map();
  for (const f of d.feedback) counts.set(f.agentId, (counts.get(f.agentId) ?? 0) + 1);
  // Agents owned by a wallet that another agent's owner funded to rate it. Agent 182's owner funded
  // 7,665 wallets to rate 182, and every one of them also registered an agent of its own, so most
  // of the registry is that one farm's raters. Only counted where an owner funded at least five
  // raters, so a single gift between two people does not turn into a farm.
  const fundedBy = new Map(); // owner -> Set(wallet)
  for (const [k] of d.funded ?? []) {
    const [o, w] = k.split("|");
    (fundedBy.get(o) ?? fundedBy.set(o, new Set()).get(o)).add(w);
  }
  const ownedBy = new Map(); // wallet -> [agentId]
  for (const r of d.registrations) {
    const o = r.owner.toLowerCase();
    (ownedBy.get(o) ?? ownedBy.set(o, []).get(o)).push(r.agentId);
  }
  const ratersOf = new Map();
  for (const f of d.feedback) (ratersOf.get(f.agentId) ?? ratersOf.set(f.agentId, new Set()).get(f.agentId)).add(f.client.toLowerCase());
  const puppets = new Map(); // agentId -> { farm, fundedRaters }
  for (const [farm, raters] of ratersOf) {
    const fo = owners.get(farm)?.toLowerCase();
    const funded = fo && fundedBy.get(fo);
    if (!funded) continue;
    const mine = [...raters].filter((r) => funded.has(r));
    if (mine.length < 5) continue;
    for (const r of mine) for (const id of ownedBy.get(r) ?? []) if (id !== farm) puppets.set(id, { farm, fundedRaters: mine.length });
  }
  registryCache = { mtimeMs, owners, counts, puppets, indexedAt: d.indexedAt, minimum: d.minFeedback ?? 5 };
  return registryCache;
}

/// When this agent's owner is one of the wallets another agent's owner funded to rate it.
export function puppetOf(agentId) {
  const p = registry().puppets.get(Number(agentId));
  if (!p) return null;
  return {
    field: { farmAgent: p.farm, fundedRaters: p.fundedRaters },
    sentence: ` Its owner is one of the ${p.fundedRaters.toLocaleString("en-US")} wallets the owner of agent ${p.farm} funded `
      + `and that then rated agent ${p.farm}.`,
  };
}

/// Why there is no verdict for an agent that provenance does not cover, said precisely. "Fewer
/// than the minimum, or does not exist" lumped three different facts together, and one of them
/// (registered, never rated) is the honest state of most agents, including our own.
export function uncovered(agentId) {
  const u = uncoveredBase(agentId);
  const p = u.registered && puppetOf(agentId);
  return p ? { ...u, why: u.why.replace(/\.?$/, ".") + p.sentence, ownerFundedToRate: p.field } : u;
}

function uncoveredBase(agentId) {
  const r = registry();
  const id = Number(agentId);
  const base = { agentId: id, verdict: "not covered", minimum: r.minimum, indexedAt: r.indexedAt };
  if (!r.owners.has(id)) {
    return { ...base, registered: false, ratings: 0,
      why: `agent ${id} is not registered in the ERC-8004 registry on Monad, as of our index at ${r.indexedAt}` };
  }
  const n = r.counts.get(id) ?? 0;
  const o = ownerSent(id);
  if (o) {
    return { ...base, registered: true, owner: r.owners.get(id), ratings: n, ownerSentRatings: o.field,
      why: `agent ${id} has ${n} rating${n === 1 ? "" : "s"}, too few for a provenance verdict, but `
        + (o.field.ratings === 1 && n === 1 ? "it was" : `${o.field.ratings} of them were`)
        + ` sent by the agent's own owner, as a transaction from the owner to the rater's account` };
  }
  return { ...base, registered: true, owner: r.owners.get(id), ratings: n,
    why: n === 0
      ? `agent ${id} is registered but has never been rated, so there is nothing to judge`
      : n < r.minimum
        ? `agent ${id} has ${n} rating${n === 1 ? "" : "s"}; provenance is computed from ${r.minimum}, so there is nothing to judge yet`
        // Should not happen: the provenance pass covers every agent at the minimum. Say so rather
        // than pretend the agent is under it.
        : `agent ${id} has ${n} ratings but is missing from the provenance pass, which is our fault, not the agent's` };
}
