// The hosted MCP endpoint answers the same tools and never buys with the service's key.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const PORT = 18_000 + Math.floor(Math.random() * 2000);
let child;

before(async () => {
  // No key: if the refusal below ever broke, a test run must fail rather than buy. A first version
  // of this test, run against a deliberately broken guard, spent one real cent from the purse.
  child = spawn("node", ["src/mcp-http.mjs"], {
    env: { ...process.env, MCP_PORT: String(PORT), X402_KEY_FILE: "/nonexistent/no-key-in-tests" },
  });
  await new Promise((resolve, reject) => {
    child.stdout.on("data", (d) => /MCP over HTTP/.test(d) && resolve());
    child.on("exit", (code) => reject(new Error(`server exited ${code}`)));
  });
});
after(() => child?.kill());

const call = async (id, method, params) => {
  const r = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  return r.json();
};

test("lists the three tools", async () => {
  const r = await call(1, "tools/list", {});
  assert.deepEqual(r.result.tools.map((t) => t.name).sort(), ["agent_trust", "trust_summary", "wallet_trust"]);
});

test("agent 182 is farmed over HTTP MCP", async () => {
  const r = await call(2, "tools/call", { name: "agent_trust", arguments: { agentId: 182 } });
  const body = JSON.parse(r.result.content[0].text);
  assert.equal(body.verdict, "farmed");
  assert.equal(body.code, "FARMED");
});

test("buy: true is refused on the public endpoint, with a way to pay for it yourself", async () => {
  const r = await call(3, "tools/call", {
    name: "wallet_trust",
    arguments: { address: "0x97cd97cfe21799bacbf39d0a53469e5f82f30996", buy: true },
  });
  const body = JSON.parse(r.result.content[0].text);
  assert.equal(body.purchasedSignal.bought, false);
  assert.match(body.purchasedSignal.note, /never buys with the service's own key/);
});

test("GET is refused", async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/mcp`);
  assert.equal(r.status, 405);
});
