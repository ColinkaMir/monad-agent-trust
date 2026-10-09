// Who actually sent each rating. ERC-8004 records the rater (`client`), but the transaction that
// wrote the rating can come from somebody else: when the rater is a smart account or an EIP-7702
// account, whoever controls it sends a transaction TO that account and the account calls the
// registry. On Monad 206 ratings were written that way, and 150 of them were sent by the rated
// agent's own owner, which is the plainest form of self-review there is and invisible to every
// check that looks only at the event.
//
// One HyperSync stream over the reputation registry with its transactions joined; about 40 s on
// the free tier for the whole history, so it simply reruns in full on each refresh.
import { HypersyncClient, LogField, TransactionField, JoinMode } from "@envio-dev/hypersync-client";
import { readFileSync, writeFileSync } from "node:fs";

const TOKEN = process.env.ENVIO_API_TOKEN ?? readFileSync(`${process.env.HOME}/.envio-token`, "utf8").trim();
const REPUTATION = "0x8004baa17c55a88189ae136b182e5fda19de9b63";
const T_FEEDBACK = "0x6a4a6174";
const DEPLOY_BLOCK = 52952790;
const client = new HypersyncClient({ url: "https://monad.hypersync.xyz", apiToken: TOKEN });

const indexed = JSON.parse(readFileSync("data/indexed.json", "utf8"));
const ownerOf = new Map(indexed.registrations.map((r) => [r.agentId, r.owner.toLowerCase()]));

const t0 = Date.now();
const stream = await client.stream({
  fromBlock: DEPLOY_BLOCK,
  logs: [{ address: [REPUTATION] }],
  joinMode: JoinMode.JoinTransactions,
  fieldSelection: {
    log: [LogField.TransactionHash, LogField.Topic0, LogField.Topic1, LogField.Topic2],
    transaction: [TransactionField.Hash, TransactionField.From],
  },
}, {});
const fromOf = new Map();
const feedback = [];
for (;;) {
  const res = await stream.recv();
  if (res === null) break;
  for (const t of res.data.transactions) fromOf.set(t.hash, t.from.toLowerCase());
  for (const l of res.data.logs) {
    if (!(l.topics?.[0] ?? "").startsWith(T_FEEDBACK)) continue;
    feedback.push({ agentId: Number(BigInt(l.topics[1])), client: "0x" + l.topics[2].slice(-40), tx: l.transactionHash });
  }
}

const agents = {};
let thirdParty = 0, ownerSent = 0;
for (const f of feedback) {
  const from = fromOf.get(f.tx);
  const a = (agents[f.agentId] ??= { ratings: 0, thirdParty: 0, ownerSent: 0, example: null });
  a.ratings++;
  if (!from || from === f.client) continue;
  a.thirdParty++; thirdParty++;
  if (from === ownerOf.get(f.agentId)) { a.ownerSent++; ownerSent++; a.example ??= f.tx; }
}
for (const [id, a] of Object.entries(agents)) if (a.thirdParty === 0) delete agents[id];

const seconds = ((Date.now() - t0) / 1000).toFixed(1);
writeFileSync("data/senders.json", JSON.stringify({
  generatedAt: new Date().toISOString(), scanSeconds: +seconds, ratings: feedback.length,
  thirdParty, ownerSent, agents,
}, null, 1) + "\n");
console.log(`${feedback.length} ratings; ${thirdParty} sent by someone other than the rater, ${ownerSent} of them by the`
  + ` rated agent's own owner, on ${Object.values(agents).filter((a) => a.ownerSent).length} agents (${seconds} s)`);
