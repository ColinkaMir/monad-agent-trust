// Re-derives the bill from the chain and nothing else.
//
// This script exists because our own per-call ledger was caught inflating the bill: a rejected
// call's reconciliation window opened five blocks early, found the neighbouring call's transfer,
// and booked a payment that never happened. The per-call check is a good tripwire, but the only
// accounting that balances is the full pass: every USDC transfer from our wallet to the seller,
// each assigned to exactly one delivered answer, leftovers reported rather than absorbed.
//
//   node src/reconcile.mjs        -> data/settlement.json  (read by /spend)
import { HypersyncClient, LogField, BlockField } from "@envio-dev/hypersync-client";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const TOKEN = process.env.ENVIO_API_TOKEN
  ?? readFileSync(`${process.env.HOME}/.envio-token`, "utf8").trim();
const USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";
const KEY = process.env.X402_KEY_FILE ?? `${process.env.HOME}/.monad-testnet-ops-key`;
const LEDGER = "data/purchases.jsonl";

const { ethers } = await import("ethers");
const wallet = new ethers.Wallet(readFileSync(KEY, "utf8").trim());

if (!existsSync(LEDGER)) throw new Error("no ledger to reconcile");
const rows = readFileSync(LEDGER, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
const payTos = [...new Set(rows.map((r) => r.payTo).filter(Boolean))];
const since = new Date(rows[0].at).getTime() / 1000 - 120; // slack for clock vs block time

const pad = (a) => "0x" + "0".repeat(24) + a.slice(2).toLowerCase();
const client = new HypersyncClient({ url: "https://monad.hypersync.xyz", apiToken: TOKEN });

const transfers = [];
let from = 0;
while (true) {
  const r = await client.get({
    fromBlock: from,
    logs: [{
      address: [USDC],
      topics: [
        ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"],
        [pad(wallet.address)],
        payTos.map(pad),
      ],
    }],
    fieldSelection: {
      log: [LogField.Data, LogField.TransactionHash, LogField.BlockNumber],
      block: [BlockField.Number, BlockField.Timestamp],
    },
  });
  const ts = new Map(r.data.blocks.map((b) => [b.number, Number(b.timestamp)]));
  for (const l of r.data.logs) {
    const when = ts.get(l.blockNumber);
    if (when >= since) transfers.push({
      tx: l.transactionHash,
      when: new Date(when * 1000).toISOString(),
      usdc: Number(BigInt(l.data)) / 1e6,
    });
  }
  if (r.nextBlock >= r.archiveHeight) break;
  from = r.nextBlock;
}
transfers.sort((a, b) => a.when.localeCompare(b.when));

// Assignment: settlement lands on chain moments before the answer arrives, and the ledger row is
// written after the answer, so each transfer belongs to the earliest still-unmatched DELIVERED
// row written at-or-after it. Undelivered rows are not candidates on purpose: a transfer that can
// only be explained by a failed call is the "paid and nothing returned" case, and it must surface
// as unassigned, not be smoothed over.
const candidates = rows.filter((r) => r.delivered)
  .map((r) => ({ at: r.at, endpoint: r.endpoint, about: r.about, taken: false }));
for (const t of transfers) {
  const c = candidates.find((c) => !c.taken && c.at >= t.when);
  if (c) { c.taken = true; t.assignedTo = c.at; t.endpoint = c.endpoint.split("/").pop(); }
}

const unassigned = transfers.filter((t) => !t.assignedTo);
const out = {
  reconciledAt: new Date().toISOString(),
  wallet: wallet.address,
  payTo: payTos,
  since: new Date(since * 1000).toISOString(),
  count: transfers.length,
  totalUsdc: +transfers.reduce((n, t) => n + t.usdc, 0).toFixed(6),
  deliveredCalls: candidates.length,
  unassignedTransfers: unassigned.length,
  transfers,
};
writeFileSync("data/settlement.json", JSON.stringify(out, null, 1) + "\n");

console.log(`${out.count} transfers on chain, ${out.totalUsdc} USDC, for ${out.deliveredCalls} delivered calls`);
if (unassigned.length) {
  console.log(`UNASSIGNED (paid, nothing delivered): ${unassigned.map((t) => t.tx).join(", ")}`);
} else {
  console.log("every transfer maps to a delivered answer; nothing was paid for silence");
}
const authorized = +rows.reduce((n, r) => n + (r.paidUsdc ?? 0), 0).toFixed(6);
if (authorized !== out.totalUsdc) {
  console.log(`ledger authorized ${authorized} USDC but the chain settled ${out.totalUsdc} — `
    + "the difference is calls that were rejected before settlement. The chain's number is the bill.");
}
