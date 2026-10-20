// Where each covered agent's owner got its first money, from Monad via HyperSync.
//
// The independence filter asks two things of a rater: did it pay the owner before rating, and
// had the owner funded it. Both look only one way, owner -> rater. On 2026-10-17 a new agent
// showed the other way: the rater's 6 MON was the owner's first money ever, it arrived eight
// seconds before the owner registered the agent (and paid the registration gas with it), and the
// "paid before rating" ratings followed within two minutes. Agents 145 and 146, our two longest
// standing independent pairs, have the same shape: 0.1 MON from the rater as each owner's first
// money, two minutes before registration. A rater that set the owner up is not a customer.
//
// One stream per run over native transfers INTO the owners of agents with enough ratings to be
// covered; the first transfer with value is the owner's bootstrap. Seconds on the free tier.
import { HypersyncClient, TransactionField, BlockField } from "@envio-dev/hypersync-client";
import { readFileSync, writeFileSync } from "node:fs";

const TOKEN = process.env.ENVIO_API_TOKEN ?? readFileSync(`${process.env.HOME}/.envio-token`, "utf8").trim();
const client = new HypersyncClient({ url: "https://monad.hypersync.xyz", apiToken: TOKEN });

const idx = JSON.parse(readFileSync("data/indexed.json", "utf8"));
const counts = new Map();
for (const f of idx.feedback) counts.set(f.agentId, (counts.get(f.agentId) ?? 0) + 1);
const owners = [...new Set(idx.registrations
  .filter((r) => (counts.get(r.agentId) ?? 0) >= idx.minFeedback)
  .map((r) => r.owner.toLowerCase()))];

const t0 = Date.now();
const first = new Map(); // owner -> { at, from, wei }
const stream = await client.stream({
  fromBlock: 0,
  transactions: [{ to: owners }],
  fieldSelection: {
    transaction: [TransactionField.From, TransactionField.To, TransactionField.Value, TransactionField.BlockNumber, TransactionField.Hash],
    block: [BlockField.Number, BlockField.Timestamp],
  },
}, {});
for (;;) {
  const res = await stream.recv();
  if (res === null) break;
  const ts = new Map(res.data.blocks.map((b) => [b.number, Number(b.timestamp)]));
  for (const tx of res.data.transactions) {
    if (BigInt(tx.value ?? "0") === 0n) continue;
    const to = (tx.to ?? "").toLowerCase();
    const at = ts.get(tx.blockNumber);
    const prev = first.get(to);
    if (!prev || at < prev.at) first.set(to, { at, from: tx.from.toLowerCase(), wei: String(BigInt(tx.value)), tx: tx.hash });
  }
}
const seconds = ((Date.now() - t0) / 1000).toFixed(1);
writeFileSync("data/owner-bootstrap.json", JSON.stringify({
  generatedAt: new Date().toISOString(), scanSeconds: +seconds, owners: Object.fromEntries(first),
}, null, 1) + "\n");
console.log(`first money of ${first.size} of ${owners.length} covered owners (${seconds} s)`);
