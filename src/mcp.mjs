// The same answers over MCP, so an agent can ask before it transacts with another agent.
//
// This is the form the question actually arrives in: an agent about to pay another agent does
// not open a web page, it calls a tool. Three tools, and the split between them is deliberate:
// reading provenance is free because it is computed from public events, while buying a wallet
// signal costs $0.01 of real USDC and therefore never happens unless the caller asks for it.
//
//   node src/mcp.mjs            # stdio transport
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const STORE = "data/provenance.json";

const load = () =>
  existsSync(STORE) ? JSON.parse(readFileSync(STORE, "utf8")) : { totals: {}, agents: [] };

/// The purchased half: first-funder edges bought from Nansen per rater. Sparse on purpose —
/// it costs $0.01 a lookup — so an answer says whether it is present instead of implying it.
const bought = () =>
  existsSync("data/enrichment.json")
    ? JSON.parse(readFileSync("data/enrichment.json", "utf8")).agents ?? {}
    : {};

/// Words, not a score. A 0-100 number would invite exactly the mistake this project exists to
/// correct: treating a produced quantity as evidence.
function verdict(a) {
  if (!a) return { verdict: "unknown", why: "no feedback on this agent at all" };
  if (a.ownerFunded > 0 && a.independentPaid === 0) {
    return { verdict: "farmed",
      why: `${a.ownerFunded} of ${a.raters} raters were funded by the agent's own owner, and no `
         + `rater paid the agent before rating it. The rating count is self-produced.` };
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
      why: `${Math.round(a.busiestDayShare * 100)}% of the ratings landed on one day, which is an `
         + `event rather than a history.` };
  }
  return { verdict: "thin", why: "ratings exist but nothing in them is payment-backed." };
}

const text = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 1) }] });

const server = new Server(
  { name: "agent-trust-monad", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "agent_trust",
      description:
        "Where an ERC-8004 agent's reputation on Monad came from. Returns a verdict in words "
        + "(farmed, single-source, partly-backed, burst, thin) with the counts behind it: how many "
        + "raters the agent's own owner had funded, how many paid it before rating, and how many "
        + "survive both filters. Free: computed from public Monad events.",
      inputSchema: {
        type: "object",
        properties: { agentId: { type: "number", description: "ERC-8004 agent id, e.g. 182" } },
        required: ["agentId"],
      },
    },
    {
      name: "wallet_trust",
      description:
        "What a wallet owns among rated agents, and optionally one purchased Nansen signal about "
        + "the address. The purchase costs 0.01 USDC on Monad over x402 and is reconciled against "
        + "USDC transfer logs, so it never happens unless `buy` is true.",
      inputSchema: {
        type: "object",
        properties: {
          address: { type: "string", description: "0x-prefixed address" },
          buy: { type: "boolean", description: "pay $0.01 for a Nansen signal (default false)" },
        },
        required: ["address"],
      },
    },
    {
      name: "trust_summary",
      description:
        "The network-wide picture: how many agents are registered, how many were ever rated, and "
        + "how many ratings on the whole chain survive both provenance filters.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  const data = load();

  if (name === "agent_trust") {
    const a = data.agents.find((x) => x.agentId === Number(args.agentId));
    if (!a) {
      return text({
        agentId: Number(args.agentId),
        verdict: "not covered",
        why: `this agent has fewer than ${data.covers?.match(/\d+/)?.[0] ?? 5} ratings, or does not exist. `
           + `Only ${data.totals?.ratedAgents ?? 0} of ${data.totals?.registrations ?? 0} registered `
           + `agents have ever been rated at all.`,
      });
    }
    const e = bought()[String(args.agentId)];
    return text({
      ...a, ...verdict(a),
      corroboration: e
        ? { source: "Nansen first-funder, bought over x402", usdcSpent: e.usdcSpent,
            ratersSampled: e.ratersSampled, distinctFunders: e.distinctFunders,
            sharedFunderIsOwner: e.sharedFunderIsOwner }
        : { source: "not purchased for this agent",
            note: "so the owner-funding question here is answered from Monad alone, which cannot "
                + "see a rater funded on another chain. Buy the first-funder edge to close that." },
      indexedAt: data.indexedAt, method: data.method,
    });
  }

  if (name === "wallet_trust") {
    const addr = String(args.address ?? "");
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return text({ error: "not an address" });
    const owned = data.agents
      .filter((a) => a.owner?.toLowerCase() === addr.toLowerCase())
      .map((a) => ({ agentId: a.agentId, ...verdict(a) }));
    let purchased = { bought: false, note: "pass buy: true to spend $0.01 on a Nansen signal" };
    if (args.buy === true) {
      try {
        await run("node", ["src/buy-nansen.mjs", addr, "--live"], { timeout: 60_000 });
        const line = readFileSync("data/purchases.jsonl", "utf8").trim().split("\n").pop();
        const rec = JSON.parse(line);
        purchased = {
          bought: true, paidUsdc: rec.paidUsdc, tx: rec.tx,
          reconciledOnChain: rec.onChainTransfers > 0,
          delivered: rec.delivered, preview: rec.bodyPreview?.slice(0, 300),
        };
      } catch (e) {
        purchased = { bought: false, error: String(e.message ?? e).slice(0, 200) };
      }
    }
    return text({ address: addr, ownsRatedAgents: owned, purchasedSignal: purchased });
  }

  if (name === "trust_summary") {
    return text({
      ...data.totals,
      indexedAt: data.indexedAt,
      covers: data.covers,
      reading:
        "Of every rating on this chain, the ones that survive both filters (paid before rating, "
        + "and the rater was never funded by the agent's owner) number "
        + `${data.totals?.independentPaidRatings ?? 0}, and they come from `
        + `${data.totals?.independentPaidWalletsNetworkWide ?? 0} distinct wallets, because one `
        + "wallet is the entire independent record of two separate agents.",
    });
  }

  return text({ error: `unknown tool ${name}` });
});

await server.connect(new StdioServerTransport());
