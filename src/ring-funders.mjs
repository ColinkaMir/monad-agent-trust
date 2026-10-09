#!/usr/bin/env node
/**
 * Who paid for a ring.
 *
 * The provenance pass walks the transfers of agent OWNERS, because the February wave was an owner
 * funding its own raters. The 27 September wave is not that shape: the wallets rating each other's
 * agents were funded by somebody who owns none of them, so every filter built on owner transfers
 * looks straight past it.
 *
 * This asks the chain the other question: for the raters of an agent flagged as a ring, who sent
 * them their first MON, and is it the same somebody. On the September ring the answer was one
 * address funding 13 of 20 wallets on a single day in February, seven months before they rated
 * anything — which is a far stronger statement than "these wallets overlap".
 *
 * Scoped to ring-shaped agents on purpose. Walking every rater on the chain would be a different
 * job with a different cost; there are a handful of these, and the query is one call each.
 *
 *   node src/ring-funders.mjs            # writes data/ring-funders.json
 */
import { HypersyncClient, TransactionField, BlockField } from "@envio-dev/hypersync-client";
import { readFileSync, writeFileSync } from "node:fs";

const TOKEN = readFileSync(`${process.env.HOME}/.envio-token`, "utf8").trim();
const client = new HypersyncClient({ url: "https://monad.hypersync.xyz", apiToken: TOKEN });

const prov = JSON.parse(readFileSync("data/provenance.json", "utf8"));
const idx = JSON.parse(readFileSync("data/indexed.json", "utf8"));

/** The same shape the `ring` verdict uses, so the two cannot drift apart. */
const isRing = (a) =>
  a.independentPaid === 0 && a.ownerFunded === 0 && a.raters >= 5 && a.sharedRaterShare >= 0.5;

const ringAgents = prov.agents.filter(isRing);
if (!ringAgents.length) {
  writeFileSync("data/ring-funders.json", JSON.stringify({ generatedAt: new Date().toISOString(), agents: {} }, null, 1));
  console.log("агентов с кольцевой формой нет, писать нечего");
  process.exit(0);
}

const ratersOf = new Map();
for (const e of idx.feedback) {
  if (!ringAgents.some((a) => a.agentId === e.agentId)) continue;
  if (!ratersOf.has(e.agentId)) ratersOf.set(e.agentId, new Set());
  ratersOf.get(e.agentId).add(e.client);
}

const everyRater = [...new Set([...ratersOf.values()].flatMap((s) => [...s]))];
console.log(`кольцевых агентов: ${ringAgents.length}, разных оценивших: ${everyRater.length}`);

const started = Date.now();
const res = await client.get({
  fromBlock: 0,
  transactions: [{ to: everyRater }],
  fieldSelection: {
    transaction: [TransactionField.From, TransactionField.To, TransactionField.Value, TransactionField.BlockNumber],
    block: [BlockField.Number, BlockField.Timestamp],
  },
});
const seconds = ((Date.now() - started) / 1000).toFixed(1);

const blockTime = new Map((res.data.blocks ?? []).map((b) => [b.number, Number(b.timestamp)]));
// First money in, per wallet. A later transfer says nothing about who set the wallet up.
const firstIn = new Map();
for (const tx of res.data.transactions ?? []) {
  const to = (tx.to ?? "").toLowerCase();
  if (!everyRater.includes(to)) continue;
  if (BigInt(tx.value ?? "0") === 0n) continue;
  const ts = blockTime.get(tx.blockNumber) ?? 0;
  const prev = firstIn.get(to);
  if (!prev || ts < prev.ts) firstIn.set(to, { from: (tx.from ?? "").toLowerCase(), ts });
}

const day = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);
const out = { generatedAt: new Date().toISOString(), scanSeconds: +seconds, agents: {} };

for (const a of ringAgents) {
  const raters = [...(ratersOf.get(a.agentId) ?? [])];
  const funded = raters.map((w) => firstIn.get(w)).filter(Boolean);
  const byFunder = new Map();
  for (const f of funded) byFunder.set(f.from, [...(byFunder.get(f.from) ?? []), f.ts]);
  const [topFunder, times] = [...byFunder.entries()].sort((x, y) => y[1].length - x[1].length)[0] ?? [];
  out.agents[a.agentId] = {
    raters: raters.length,
    fundedOnMonad: funded.length,
    distinctFunders: byFunder.size,
    topFunder: topFunder ?? null,
    topFunderWallets: times?.length ?? 0,
    // The dates matter as much as the address: one batch on one day is a setup, a spread of dates
    // is a coincidence, and the reader should be able to tell them apart without asking us.
    fundingWindow: times?.length ? [day(Math.min(...times)), day(Math.max(...times))] : null,
    ratingWindow: [a.first, a.last],
  };
  console.log(
    `  агент ${a.agentId}: оценивших ${raters.length}, с деньгами на Monad ${funded.length}, ` +
      `спонсоров ${byFunder.size}` +
      (topFunder ? `, главный ${topFunder.slice(0, 12)}… у ${times.length} кошельков ${out.agents[a.agentId].fundingWindow?.[0]}` : ""),
  );
}

// How many distinct addresses each named funder has ever sent MON to. A shared funder means a
// farm only when the funder is an ordinary wallet; an exchange or a distributor funds everybody,
// and "funded by the same address" then means nothing. Nansen's label answers this for money, but
// the count is free from the chain and catches the obvious case before anything is bought.
const funders = [...new Set(Object.values(out.agents).map((a) => a.topFunder).filter(Boolean))];
if (funders.length) {
  // Streamed to the end rather than one `get`, which returns a page and would undercount a busy
  // funder silently: the busy funder is exactly the case this count exists to recognise.
  const fanOut = new Map(funders.map((x) => [x, new Set()]));
  const stream = await client.stream({
    fromBlock: 0,
    transactions: [{ from: funders }],
    fieldSelection: { transaction: [TransactionField.From, TransactionField.To, TransactionField.Value] },
  }, {});
  for (;;) {
    const res = await stream.recv();
    if (res === null) break;
    for (const tx of res.data.transactions ?? []) {
      if (BigInt(tx.value ?? "0") === 0n || !tx.to) continue;
      fanOut.get((tx.from ?? "").toLowerCase())?.add(tx.to.toLowerCase());
    }
  }
  for (const a of Object.values(out.agents)) {
    if (a.topFunder) a.topFunderRecipients = fanOut.get(a.topFunder)?.size ?? 0;
  }
  console.log(`  получателей MON у спонсоров: ${funders.map((x) => `${x.slice(0, 10)}… ${fanOut.get(x).size}`).join(", ")}`);
}

writeFileSync("data/ring-funders.json", JSON.stringify(out, null, 1));
console.log(`-> data/ring-funders.json (скан ${seconds} с)`);
