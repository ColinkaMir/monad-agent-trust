// Builds the provenance dataset behind the trust answer, straight from Monad with HyperSync.
//
// The question this data answers is not "how many ratings does this agent have" — the
// registry already tells you that, and on Monad the number is worthless: 99.7% of all
// feedback was produced over three days in February, and on the most-rated agent every
// single rater had been funded by that agent's own owner seconds before rating.
//
// Three passes, joined:
//   1. Registered(agentId, owner, uri)       — who exists
//   2. NewFeedback(agentId, client)          — who rated whom, and when
//   3. native transfers touching agent owners — where the raters' money came from
//
// (3) is the expensive half and the reason this runs on HyperSync rather than an explorer
// API: one owner here has 15,411 transactions and explorer pagination caps at 1,000 rows.
//
// Memory note, learned the hard way: the first version collected every transfer into an
// array and died in the V8 heap. Only two facts per (owner, wallet) pair are ever needed —
// the first time the owner funded that wallet and the first time that wallet paid the owner —
// so the flow pass folds into maps as it streams and never holds the history.
import { HypersyncClient, LogField, TransactionField, BlockField } from "@envio-dev/hypersync-client";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const TOKEN = readFileSync("/home/solana/.envio-token", "utf8").trim();
const IDENTITY = "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432";
const REPUTATION = "0x8004baa17c55a88189ae136b182e5fda19de9b63";
const DEPLOY_BLOCK = 52952790;
const MIN_FEEDBACK = Number(process.env.MIN_FEEDBACK ?? 5);

// topic0 prefixes verified against on-chain data on 2026-08-21
const T_REGISTERED = "0xca52e62c";
const T_FEEDBACK = "0x6a4a6174";

const client = new HypersyncClient({ url: "https://monad.hypersync.xyz", apiToken: TOKEN });
const STORE = "data/indexed.json";
const FULL = process.argv.includes("--full");

/// Previous run's coverage, so a rerun asks only for what happened since. The free tier allows
/// 30 requests a minute, which makes a full backfill a minutes-long affair and a catch-up a
/// couple of requests — the difference between a service that can refresh hourly and one that
/// cannot.
function previous() {
  if (FULL || !existsSync(STORE)) return null;
  try {
    const d = JSON.parse(readFileSync(STORE, "utf8"));
    return typeof d.head === "number" ? d : null;
  } catch {
    return null;
  }
}
const addrOf = (topic) => "0x" + topic.slice(-40).toLowerCase();
const secs = (t0) => ((Date.now() - t0) / 1000).toFixed(1);

async function registryEvents(fromBlock) {
  const t0 = Date.now();
  const registrations = [];
  const feedback = [];
  let batches = 0;
  let head = fromBlock;
  const stream = await client.stream({
    fromBlock,
    logs: [{ address: [IDENTITY, REPUTATION] }],
    fieldSelection: {
      log: [LogField.BlockNumber, LogField.Address, LogField.Topic0, LogField.Topic1, LogField.Topic2],
      block: [BlockField.Number, BlockField.Timestamp],
    },
  }, {});
  for (;;) {
    const res = await stream.recv();
    if (res === null) break;
    batches++;
    if (typeof res.nextBlock === "number") head = res.nextBlock;
    const times = new Map(res.data.blocks.map((b) => [b.number, Number(b.timestamp)]));
    for (const log of res.data.logs) {
      // The client returns topics as an ARRAY, not as topic0/topic1/topic2 fields. Reading the
      // named fields silently yields undefined and the whole pass finds nothing, which is
      // exactly how the first run reported "0 registrations" over 36 batches.
      const [t0, t1, t2] = log.topics ?? [];
      if (!t0 || !t1 || !t2) continue;
      const ts = times.get(log.blockNumber) ?? 0;
      const t = t0.toLowerCase();
      const at = log.address.toLowerCase();
      if (at === IDENTITY && t.startsWith(T_REGISTERED)) {
        registrations.push({ agentId: Number(BigInt(t1)), owner: addrOf(t2), ts });
      } else if (at === REPUTATION && t.startsWith(T_FEEDBACK)) {
        feedback.push({ agentId: Number(BigInt(t1)), client: addrOf(t2), ts });
      }
    }
  }
  return { registrations, feedback, seconds: secs(t0), batches, head };
}

/// Folds the owners' transfer history into first-seen edges, keeping only the pairs that can
/// change a verdict: owner -> rater (funding) and rater -> owner (payment).
async function fundingEdges(owners, raters, fromBlock) {
  const t0 = Date.now();
  const funded = new Map();   // `${owner}|${wallet}` -> ts
  const paid = new Map();     // `${wallet}|${owner}` -> ts
  let scanned = 0;
  // An EMPTY address list here means "match everything", not "match nothing". That is how the
  // first run turned into a twenty-minute full-chain scan: a parsing bug left owners empty, the
  // filter degenerated to match-all, and the free tier's 30 requests a minute did the rest.
  if (owners.size === 0 || raters.size === 0) return { funded: new Map(), paid: new Map(), scanned: 0, seconds: "0.0" };
  const stream = await client.stream({
    fromBlock,
    transactions: [{ from: [...owners] }, { to: [...owners] }],
    fieldSelection: {
      transaction: [TransactionField.BlockNumber, TransactionField.From, TransactionField.To,
                    TransactionField.Value],
      block: [BlockField.Number, BlockField.Timestamp],
    },
  }, {});
  for (;;) {
    const res = await stream.recv();
    if (res === null) break;
    const times = new Map(res.data.blocks.map((b) => [b.number, Number(b.timestamp)]));
    for (const tx of res.data.transactions) {
      scanned++;
      if (!tx.value || BigInt(tx.value) === 0n) continue;
      const from = (tx.from ?? "").toLowerCase();
      const to = (tx.to ?? "").toLowerCase();
      const ts = times.get(tx.blockNumber) ?? 0;
      if (owners.has(from) && raters.has(to)) {
        const k = `${from}|${to}`;
        if (!funded.has(k) || funded.get(k) > ts) funded.set(k, ts);
      }
      if (owners.has(to) && raters.has(from)) {
        const k = `${from}|${to}`;
        if (!paid.has(k) || paid.get(k) > ts) paid.set(k, ts);
      }
    }
  }
  return { funded, paid, scanned, seconds: secs(t0) };
}

const main = async () => {
  mkdirSync("data", { recursive: true });
  const prior = previous();
  const from = prior ? prior.head : DEPLOY_BLOCK;
  console.log(prior
    ? `catching up both ERC-8004 registries from block ${from} (previous run covered to there) …`
    : `indexing both ERC-8004 registries from block ${from} …`);

  const fresh = await registryEvents(from);
  console.log(`  ${fresh.registrations.length} new registrations, ${fresh.feedback.length} new `
    + `feedback events in ${fresh.seconds}s (${fresh.batches} batches), head now ${fresh.head}`);

  // Merge before deciding what needs the funding pass: an agent that crossed the threshold with
  // today's ratings still needs its owner's history walked from the start, not from `from`.
  const registrations = [...(prior?.registrations ?? []), ...fresh.registrations];
  const feedback = [...(prior?.feedback ?? []), ...fresh.feedback];

  const ownerOf = new Map(registrations.map((r) => [r.agentId, r.owner]));
  const perAgent = new Map();
  for (const f of feedback) {
    if (!perAgent.has(f.agentId)) perAgent.set(f.agentId, []);
    perAgent.get(f.agentId).push(f);
  }
  const covered = [...perAgent.entries()].filter(([, evs]) => evs.length >= MIN_FEEDBACK);
  const owners = new Set(covered.map(([id]) => ownerOf.get(id)).filter(Boolean));
  const raters = new Set(covered.flatMap(([, evs]) => evs.map((e) => e.client)));

  const funded = new Map(prior?.funded ?? []);
  const paid = new Map(prior?.paid ?? []);
  const knownOwners = new Set(prior?.owners ?? []);
  // Owners we have never walked need their whole history; the rest only need the new blocks.
  const newOwners = new Set([...owners].filter((o) => !knownOwners.has(o)));
  console.log(`  ${perAgent.size} agents rated; ${covered.length} with >= ${MIN_FEEDBACK}; `
    + `${owners.size} owners (${newOwners.size} not walked before)`);

  const merge = (target, entries) => {
    for (const [k, ts] of entries) if (!target.has(k) || target.get(k) > ts) target.set(k, ts);
  };
  let scanned = 0;
  if (newOwners.size) {
    const full = await fundingEdges(newOwners, raters, DEPLOY_BLOCK);
    merge(funded, full.funded); merge(paid, full.paid); scanned += full.scanned;
    console.log(`  full history for ${newOwners.size} new owner(s): ${full.scanned} transactions in ${full.seconds}s`);
  }
  const oldOwners = new Set([...owners].filter((o) => knownOwners.has(o)));
  if (prior && oldOwners.size) {
    const tail = await fundingEdges(oldOwners, raters, from);
    merge(funded, tail.funded); merge(paid, tail.paid); scanned += tail.scanned;
    console.log(`  catch-up for ${oldOwners.size} known owner(s): ${tail.scanned} transactions in ${tail.seconds}s`);
  }
  console.log(`  ${scanned} transactions scanned -> ${funded.size} funding edges, ${paid.size} payment edges`);

  writeFileSync(STORE, JSON.stringify({
    indexedAt: new Date().toISOString(),
    source: "Monad mainnet via Envio HyperSync",
    minFeedback: MIN_FEEDBACK,
    head: fresh.head,
    owners: [...owners],
    registrations,
    feedback,
    funded: [...funded.entries()],
    paid: [...paid.entries()],
  }));
  console.log(`  -> ${STORE}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
