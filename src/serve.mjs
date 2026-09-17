// The service that answers "can this agent be trusted" and shows its own bill.
//
// Two sources, deliberately different in kind:
//   provenance  — computed by us from Monad events indexed through HyperSync. Free to read,
//                 because the interesting part is the method, not the data hoard.
//   wallet risk — bought from Nansen per question over x402 on Monad, $0.01 a call, with the
//                 payment reconciled against USDC transfer logs rather than the seller's header.
//
// Answers carry their cost. A caller can see which part of the verdict was computed and which
// was purchased, how much it cost and the transaction that paid for it, because a trust
// service that hides its own inputs is asking for exactly the faith it claims to replace.
import { createServer } from "node:http";
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ethers } from "ethers";
import * as vouchers from "./vouchers.mjs";
import { promisify } from "node:util";

const run = promisify(execFile);
const PORT = Number(process.env.PORT ?? 8460);
// Loopback by default: nginx terminates TLS and proxies, so binding every interface would only
// widen the attack surface of an endpoint that spends money.
const HOST = process.env.HOST ?? "127.0.0.1";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;   // a purchased signal is good for six hours
const RPC = process.env.MONAD_RPC ?? "https://rpc.monad.xyz";
const USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";
// The wallet that pays for x402 calls. Public by nature: every purchase it makes is on chain.
const AGENT_WALLET = process.env.AGENT_WALLET ?? "0x9E66867adfDC613891A96d82a53988829cD39004";
// What a visitor's voucher has to match to be spendable. Checked again against the live offer
// inside buy-nansen.mjs, because a price that moved between the signature and the spend must
// stop the payment rather than quietly cost the signer more than they agreed to.
const NANSEN_PAYTO = process.env.NANSEN_PAYTO ?? "0x93053f1e7A5eFEDa532Fe69CbbE43cBEc3A0F13f";
const NANSEN_PRICE = process.env.NANSEN_PRICE ?? "10000";
const walletCache = new Map();

const load = () =>
  existsSync("data/provenance.json")
    ? JSON.parse(readFileSync("data/provenance.json", "utf8"))
    : { totals: {}, agents: [], generatedAt: null };

/// What we bought about an agent's raters, if anything. Kept separate from the computed index
/// because it costs money and is therefore sparse: most agents have never been enriched, and an
/// answer has to say which of its two halves is present rather than imply both.
const enrichment = () =>
  existsSync("data/enrichment.json")
    ? JSON.parse(readFileSync("data/enrichment.json", "utf8"))
    : { funders: {}, agents: {} };

/// The purchased half of the verdict. Our own index can say the owner funded a rater ON MONAD;
/// Nansen's first-funder edge says who funded it first ANYWHERE, which is the question a farm
/// would have to defeat on every chain at once.
function corroboration(e) {
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

/// Plain-language reading of the numbers. Deliberately blunt: the point of the project is that
/// a count of ratings means nothing here, so the verdict says why rather than scoring 0-100.
function verdict(a) {
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
  if (a.busiestDayShare > 0.8) {
    return { verdict: "burst",
      why: `${Math.round(a.busiestDayShare * 100)}% of all ratings landed on one day, which is an `
         + `event rather than a history.` };
  }
  return { verdict: "thin", why: "ratings exist but nothing in them is payment-backed." };
}

/// Buys one signal about `addr`. If `payer` has delegated vouchers, one of theirs is spent and
/// the money goes straight from them to Nansen; otherwise the agent pays out of its own purse.
///
/// The visitor's voucher is preferred deliberately. A question asked by somebody who delegated
/// should cost them, not the house, and the answer can then say whose money settled it.
async function walletSignal(addr, payer = null) {
  const hit = walletCache.get(addr.toLowerCase());
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ...hit.data, cached: true };
  let voucher = null, voucherFile = null;
  if (payer) {
    try {
      voucher = await vouchers.pick(payer, {
        payTo: NANSEN_PAYTO, amount: NANSEN_PRICE,
        provider: new ethers.JsonRpcProvider(RPC),
      });
    } catch { voucher = null; }
    if (voucher) {
      voucherFile = join(tmpdir(), `voucher-${voucher.nonce.slice(2, 14)}.json`);
      writeFileSync(voucherFile, JSON.stringify(voucher));
    }
  }
  try {
    const { stdout } = await run("node", ["src/buy-nansen.mjs", addr, "--live"],
      { timeout: 60_000, env: voucherFile ? { ...process.env, X402_VOUCHER: voucherFile } : process.env });
    const line = existsSync("data/purchases.jsonl")
      ? readFileSync("data/purchases.jsonl", "utf8").trim().split("\n").pop() : null;
    const rec = line ? JSON.parse(line) : null;
    const data = {
      bought: true,
      paidUsdc: rec?.paidUsdc ?? null,
      tx: rec?.tx ?? null,
      reconciled: (rec?.onChainTransfers ?? 0) > 0,
      delivered: rec?.delivered ?? false,
      paidBy: voucher ? "your delegated voucher" : "the agent's own purse",
      payer: rec?.payer ?? null,
      preview: rec?.bodyPreview?.slice(0, 200) ?? stdout.slice(-200),
    };
    if (voucher) vouchers.markSpent(voucher.nonce, voucher.from, rec?.tx ?? null);
    walletCache.set(addr.toLowerCase(), { at: Date.now(), data });
    return data;
  } catch (e) {
    return { bought: false, error: String(e.message ?? e).slice(0, 200) };
  } finally {
    // The signature is a bearer instrument for one payment; it does not linger in /tmp.
    if (voucherFile) { try { unlinkSync(voucherFile); } catch {} }
  }
}

const json = (res, code, obj) => {
  const body = JSON.stringify(obj, null, 1);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=60",
  });
  res.end(body);
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  const prov = load();

  // The page is served from somewhere else, so the browser asks permission before POSTing a
  // signature to us.
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Max-Age": "86400",
    });
    return res.end();
  }

  // Delegation: a visitor hands over signed authorizations instead of a balance. Nothing is
  // trusted here except the signatures, and vouchers.check discards any that do not recover to
  // the address that claims to have signed them.
  if (p === "/delegate" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 256_000) { req.destroy(); return; }
    }
    let parsed;
    try { parsed = JSON.parse(body); } catch { return json(res, 400, { error: "body is not JSON" }); }
    const result = vouchers.accept(parsed.vouchers);
    const who = parsed.vouchers?.[0]?.from;
    return json(res, 200, {
      ...result,
      summary: who ? vouchers.summary(who) : null,
      note: "each voucher pays Nansen directly when a question of yours is answered. The money "
          + "never passes through this service, and unspent vouchers can be cancelled on chain "
          + "with cancelAuthorization(authorizer, nonce, v, r, s) on USDC.",
    });
  }

  const delegationMatch = p.match(/^\/delegation\/(0x[0-9a-fA-F]{40})$/);
  if (delegationMatch) return json(res, 200, vouchers.summary(delegationMatch[1]));

  if (p === "/" || p === "/health") {
    return json(res, 200, {
      service: "agent-trust",
      about: "Provenance of ERC-8004 reputation on Monad, with wallet signals bought per call over x402.",
      indexedAt: prov.indexedAt ?? null,
      totals: prov.totals,
      endpoints: ["/agent/:id", "/wallet/:address", "/agents", "/spend", "/agent-wallet",
                  "/delegate (POST)", "/delegation/:address"],
    });
  }

  if (p === "/agents") {
    return json(res, 200, {
      generatedAt: prov.generatedAt,
      covers: prov.covers,
      agents: prov.agents.map((a) => ({ ...a, ...verdict(a) })),
    });
  }

  const agentMatch = p.match(/^\/agent\/(\d+)$/);
  if (agentMatch) {
    const a = prov.agents.find((x) => x.agentId === Number(agentMatch[1]));
    const e = enrichment().agents[agentMatch[1]];
    return json(res, a ? 200 : 404, a
      ? { ...a, ...verdict(a), corroboration: corroboration(e),
          method: prov.method, indexedAt: prov.indexedAt }
      : { error: "agent has fewer than the covered minimum of ratings, or does not exist" });
  }

  const walletMatch = p.match(/^\/wallet\/(0x[0-9a-fA-F]{40})$/);
  if (walletMatch) {
    const addr = walletMatch[1];
    const owned = prov.agents.filter((a) => a.owner?.toLowerCase() === addr.toLowerCase());
    // ?payer= names who should pay for this answer. It is not an identity claim and nothing is
    // taken on its word: it only selects among vouchers that address already signed, so naming
    // somebody else's address can spend nothing that they did not authorise for exactly this.
    const payer = url.searchParams.get("payer");
    const namedPayer = /^0x[0-9a-fA-F]{40}$/.test(payer ?? "") ? payer : null;
    // Public and paid do not mix by default. This endpoint spends real USDC, so on the open
    // internet an unauthenticated caller must not be able to empty the agent's purse by holding
    // down refresh. A purchase happens when the caller brought their own delegated voucher, or
    // when the operator explicitly allows the house to pay (AGENT_PAYS_FOR_STRANGERS=1).
    const HOUSE_PAYS = process.env.AGENT_PAYS_FOR_STRANGERS === "1";
    const delegated = namedPayer ? vouchers.summary(namedPayer).questionsLeft > 0 : false;
    let signal;
    if (url.searchParams.get("buy") === "0") {
      signal = { bought: false, skipped: true };
    } else if (delegated || HOUSE_PAYS) {
      signal = await walletSignal(addr, delegated ? namedPayer : null);
    } else {
      signal = {
        bought: false,
        why: namedPayer
          ? "that address has no unspent delegated questions left"
          : "a purchased signal costs $0.01 of real USDC, so it is not spent for anonymous "
            + "callers. Delegate a question first, then ask again with ?payer=<your address>.",
        delegate: "POST /delegate",
      };
    }
    return json(res, 200, {
      address: addr,
      ownsRatedAgents: owned.map((a) => ({ agentId: a.agentId, ...verdict(a) })),
      purchasedSignal: signal,
      note: "The provenance half is computed from Monad events. The signal half was bought from "
          + "Nansen for the price shown and reconciled on chain.",
    });
  }

  // Where the agent's money lives, so the page can show what it is funding and the visitor can
  // check the balance themselves rather than take our word for it. Read-only: the service never
  // exposes the key, and the address is the same one that pays for the Nansen calls.
  if (p === "/agent-wallet") {
    const call = async (to, data) => {
      const r = await fetch(RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call",
                               params: [{ to, data }, "latest"] }),
      });
      return (await r.json()).result ?? "0x0";
    };
    const balanceOf = "0x70a08231000000000000000000000000" + AGENT_WALLET.slice(2).toLowerCase();
    const [usdcHex, monRes] = await Promise.all([
      call(USDC, balanceOf),
      fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" },
                   body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance",
                                          params: [AGENT_WALLET, "latest"] }) }).then((r) => r.json()),
    ]);
    return json(res, 200, {
      address: AGENT_WALLET,
      usdc: Number(BigInt(usdcHex || "0x0")) / 1e6,
      mon: Number(BigInt(monRes.result ?? "0x0")) / 1e18,
      usdcToken: USDC,
      chainId: 143,
      note: "Nansen calls are paid from this address. Top it up and the service can keep answering.",
    });
  }

  if (p === "/spend") {
    const lines = existsSync("data/purchases.jsonl")
      ? readFileSync("data/purchases.jsonl", "utf8").trim().split("\n").filter(Boolean).map(JSON.parse)
      : [];
    // The bill is the chain's number, not the ledger's. The per-call ledger once over-counted
    // itself by four cents (a rejected call booked a neighbour's transfer), which is why the
    // settled figures come from the full on-chain pass in src/reconcile.mjs when it has run.
    const settled = existsSync("data/settlement.json")
      ? JSON.parse(readFileSync("data/settlement.json", "utf8"))
      : null;
    return json(res, 200, {
      calls: lines.length,
      usdcSpent: settled
        ? settled.totalUsdc
        : +lines.reduce((n, l) => n + (l.paidUsdc ?? 0), 0).toFixed(6),
      usdcAuthorized: +lines.reduce((n, l) => n + (l.paidUsdc ?? 0), 0).toFixed(6),
      delivered: lines.filter((l) => l.delivered).length,
      paidButNotDelivered: settled
        ? settled.unassignedTransfers
        : lines.filter((l) => !l.delivered && l.onChainTransfers > 0).length,
      missingSettlementHeader: lines.filter((l) => l.delivered && !l.settlementHeader).length,
      reconciledAt: settled?.reconciledAt ?? null,
      note: settled
        ? "usdcSpent is the sum of USDC transfers on chain; usdcAuthorized is what the signed "
          + "x402 authorizations added up to. The gap is calls rejected before settlement."
        : "run src/reconcile.mjs for the on-chain figure; until then usdcSpent trusts the ledger",
      purchases: lines.slice(-25),
    });
  }

  json(res, 404, { error: "not found" });
}).listen(PORT, HOST, () => console.log(`agent-trust listening on ${HOST}:${PORT}`));
