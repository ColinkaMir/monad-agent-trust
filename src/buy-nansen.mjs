// Buys one Nansen signal about a wallet, per call, over x402 on Monad.
//
// Why this exists rather than an API key: Nansen sells its Pro endpoints over x402 in USDC on
// Base, Solana and Monad, permissionless, $0.01 for the basic tier. So the service does not
// hold a subscription, it pays per question — and, being an agent-facing service, it is asked
// questions by other agents who pay us the same way. The money in and the money out are the
// same rail, which is the point.
//
// The reconciliation is not decoration. In our September survey of every x402 seller on Monad,
// 7 of 19 paid calls returned an error after taking the money, and one returned HTTP 200 with
// no settlement header, so the client's own accounting under-counted what it had spent. Trust
// the chain, not the seller's headers.
//
//   node src/buy-nansen.mjs <address> [--live]
import { ethers } from "ethers";
import { readFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

const RPC = "https://rpc.monad.xyz";
// same ops wallet signs on mainnet; it paid the September round
const KEY = process.env.X402_KEY_FILE ?? `${process.env.HOME}/.monad-testnet-ops-key`;
const USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";
const LEDGER = "data/purchases.jsonl";
// A basic-tier Nansen call is $0.01. Anything above this is not the offer we agreed to.
const PER_CALL_CAP = 20_000n; // 0.02 USDC in 6 decimals

const ENDPOINT = process.env.NANSEN_ENDPOINT
  ?? "https://api.nansen.ai/api/v1/profiler/address/current-balance";

const target = process.argv[2];
const LIVE = process.argv.includes("--live");
if (!target) throw new Error("usage: buy-nansen.mjs <address> [--live]");

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(readFileSync(KEY, "utf8").trim(), provider);

// Each endpoint validates its body strictly and rejects with HTTP 422 BEFORE taking payment,
// which is decent of them and rare: in our September survey of Monad x402 sellers, 7 of 19 paid
// calls took the money first and failed afterwards. Shapes below are what the live API accepts,
// found by asking it rather than by reading docs: current-balance wants a chain name and a
// pagination envelope, first-funder accepts only chain "all" and refuses extra fields.
const CHAIN = process.env.NANSEN_CHAIN ?? "ethereum";
const BODIES = {
  "first-funder": (addr) => ({ address: addr, chain: "all" }),
  // related-wallets refuses chain "all" and wants a named chain; its valid list does include
  // monad. (An earlier note here claimed it charges for rejected bodies. The chain says
  // otherwise: that ledger row had booked a neighbouring call's transfer, because the
  // reconciliation window used to open five blocks before the request. src/reconcile.mjs
  // is the full-pass check that caught it.)
  "related-wallets": (addr) => ({ address: addr, chain: process.env.NANSEN_CHAIN ?? "monad" }),
  "counterparties": (addr) => ({ address: addr, chain: CHAIN,
                                 pagination: { page: 1, per_page: 20 } }),
};
const shape = Object.keys(BODIES).find((k) => ENDPOINT.includes(k));
const body = shape
  ? BODIES[shape](target)
  : { address: target, chain: CHAIN, hide_spam_token: true, pagination: { page: 1, per_page: 10 } };

const ask = (headers) => fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": "prooflines-agent-trust/1.0", ...headers },
  body: JSON.stringify(body),
});

const offer = await ask({});
if (offer.status !== 402) {
  console.log(`no payment required (HTTP ${offer.status}) — endpoint changed or already open`);
  console.log((await offer.text()).slice(0, 300));
  process.exit(1);
}

// The offer can arrive as a header or as the body; both are in the wild.
const hdr = offer.headers.get("payment-required") ?? offer.headers.get("x-payment-required");
let pr = null;
if (hdr) { try { pr = JSON.parse(Buffer.from(hdr, "base64").toString()); } catch {} }
if (!pr) { try { pr = await offer.json(); } catch {} }
const accepted = (pr?.accepts ?? []).find((a) => a.network === "eip155:143" && a.scheme === "exact");
if (!accepted) {
  console.log("no Monad rail in the live offer; rails advertised:",
    (pr?.accepts ?? []).map((a) => a.network).join(", ") || "none");
  process.exit(1);
}
const amount = BigInt(accepted.amount ?? accepted.maxAmountRequired ?? 0);
console.log(`offer: ${Number(amount) / 1e6} USDC to ${accepted.payTo} on ${accepted.network}`);
if (amount > PER_CALL_CAP) { console.log("above our per-call cap, refusing"); process.exit(1); }
if (!LIVE) { console.log("dry run, nothing spent. re-run with --live"); process.exit(0); }

const now = Math.floor(Date.now() / 1000);
const authorization = {
  from: wallet.address, to: accepted.payTo, value: String(amount),
  validAfter: String(now - 60),
  validBefore: String(now + (accepted.maxTimeoutSeconds ?? 300)),
  nonce: ethers.hexlify(randomBytes(32)),
};
const signature = await wallet.signTypedData(
  { name: accepted.extra?.name ?? "USDC", version: accepted.extra?.version ?? "2",
    chainId: 143, verifyingContract: accepted.asset ?? USDC },
  { TransferWithAuthorization: [
    { name: "from", type: "address" }, { name: "to", type: "address" },
    { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
  { ...authorization, value: amount,
    validAfter: BigInt(authorization.validAfter), validBefore: BigInt(authorization.validBefore) });

const payment = Buffer.from(JSON.stringify({
  x402Version: 2, resource: pr.resource ?? ENDPOINT, accepted,
  payload: { signature, authorization },
})).toString("base64");

const blockBefore = await provider.getBlockNumber();
const res = await ask({ "PAYMENT-SIGNATURE": payment });
const settleHdr = res.headers.get("payment-response");
const text = await res.text();

// Reconcile against the chain: the seller's settlement header is a claim, a USDC Transfer log
// from our wallet to theirs is a fact.
const usdc = new ethers.Contract(USDC, ["event Transfer(address indexed from, address indexed to, uint256 value)"], provider);
// Two guards, both learned the hard way: settlement cannot land before the request was sent, and
// a transfer already claimed by an earlier ledger row is not ours. Without them, back-to-back
// calls each "find" their neighbour's transfer and a rejected call books a payment that never
// happened. src/reconcile.mjs is the full-pass version of this check.
const claimed = new Set(
  (existsSync(LEDGER) ? readFileSync(LEDGER, "utf8").trim().split("\n").filter(Boolean) : [])
    .map((l) => JSON.parse(l).tx).filter(Boolean));
const logs = await usdc.queryFilter(usdc.filters.Transfer(wallet.address, accepted.payTo),
                                    blockBefore, "latest").catch(() => []);
const onChain = logs.filter((l) => l.args?.value === amount && !claimed.has(l.transactionHash));

const record = {
  at: new Date().toISOString(),
  endpoint: ENDPOINT, about: target,
  paidUsdc: Number(amount) / 1e6,
  payTo: accepted.payTo,
  httpStatus: res.status,
  delivered: res.status === 200 && text.trim().length > 0,
  settlementHeader: Boolean(settleHdr),
  onChainTransfers: onChain.length,
  tx: onChain[0]?.transactionHash ?? null,
  bodyPreview: text.slice(0, 300),
};
mkdirSync("data", { recursive: true });
appendFileSync(LEDGER, JSON.stringify(record) + "\n");

console.log(`HTTP ${record.httpStatus} | delivered ${record.delivered} | settlement header `
  + `${record.settlementHeader} | on-chain transfers matching the amount: ${record.onChainTransfers}`);
if (record.tx) console.log(`tx ${record.tx}`);
if (!record.settlementHeader && record.onChainTransfers > 0) {
  console.log("note: paid on chain with no settlement header — accounting that trusts the header "
    + "would under-count this spend. Recorded from the chain instead.");
}
console.log(record.bodyPreview);
