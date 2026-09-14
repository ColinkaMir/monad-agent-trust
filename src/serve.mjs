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
import { promisify } from "node:util";

const run = promisify(execFile);
const PORT = Number(process.env.PORT ?? 8460);
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;   // a purchased signal is good for six hours
const walletCache = new Map();

const load = () =>
  existsSync("data/provenance.json")
    ? JSON.parse(readFileSync("data/provenance.json", "utf8"))
    : { totals: {}, agents: [], generatedAt: null };

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

async function walletSignal(addr) {
  const hit = walletCache.get(addr.toLowerCase());
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ...hit.data, cached: true };
  try {
    const { stdout } = await run("node", ["src/buy-nansen.mjs", addr, "--live"], { timeout: 60_000 });
    const line = existsSync("data/purchases.jsonl")
      ? readFileSync("data/purchases.jsonl", "utf8").trim().split("\n").pop() : null;
    const rec = line ? JSON.parse(line) : null;
    const data = {
      bought: true,
      paidUsdc: rec?.paidUsdc ?? null,
      tx: rec?.tx ?? null,
      reconciled: (rec?.onChainTransfers ?? 0) > 0,
      delivered: rec?.delivered ?? false,
      preview: rec?.bodyPreview?.slice(0, 200) ?? stdout.slice(-200),
    };
    walletCache.set(addr.toLowerCase(), { at: Date.now(), data });
    return data;
  } catch (e) {
    return { bought: false, error: String(e.message ?? e).slice(0, 200) };
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

  if (p === "/" || p === "/health") {
    return json(res, 200, {
      service: "agent-trust",
      about: "Provenance of ERC-8004 reputation on Monad, with wallet signals bought per call over x402.",
      indexedAt: prov.indexedAt ?? null,
      totals: prov.totals,
      endpoints: ["/agent/:id", "/wallet/:address", "/agents", "/spend"],
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
    return json(res, a ? 200 : 404, a
      ? { ...a, ...verdict(a), method: prov.method, indexedAt: prov.indexedAt }
      : { error: "agent has fewer than the covered minimum of ratings, or does not exist" });
  }

  const walletMatch = p.match(/^\/wallet\/(0x[0-9a-fA-F]{40})$/);
  if (walletMatch) {
    const addr = walletMatch[1];
    const owned = prov.agents.filter((a) => a.owner?.toLowerCase() === addr.toLowerCase());
    const signal = url.searchParams.get("buy") === "0" ? { bought: false, skipped: true }
                                                       : await walletSignal(addr);
    return json(res, 200, {
      address: addr,
      ownsRatedAgents: owned.map((a) => ({ agentId: a.agentId, ...verdict(a) })),
      purchasedSignal: signal,
      note: "The provenance half is computed from Monad events. The signal half was bought from "
          + "Nansen for the price shown and reconciled on chain.",
    });
  }

  if (p === "/spend") {
    const lines = existsSync("data/purchases.jsonl")
      ? readFileSync("data/purchases.jsonl", "utf8").trim().split("\n").filter(Boolean).map(JSON.parse)
      : [];
    return json(res, 200, {
      calls: lines.length,
      usdcSpent: +lines.reduce((n, l) => n + (l.paidUsdc ?? 0), 0).toFixed(6),
      delivered: lines.filter((l) => l.delivered).length,
      paidButNotDelivered: lines.filter((l) => !l.delivered && l.onChainTransfers > 0).length,
      missingSettlementHeader: lines.filter((l) => l.delivered && !l.settlementHeader).length,
      purchases: lines.slice(-25),
    });
  }

  json(res, 404, { error: "not found" });
}).listen(PORT, () => console.log(`agent-trust listening on :${PORT}`));
