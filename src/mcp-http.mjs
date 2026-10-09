// The MCP tools over Streamable HTTP, so an agent connects with a URL instead of cloning the repo:
//
//   { "mcpServers": { "agent-trust": { "url": "https://prooflines.org/monad/agent-trust/mcp" } } }
//
// Stateless: every POST gets a fresh server and transport, because the tools read files and keep
// nothing between calls, so there is no session worth holding. Purchases are off here (see
// makeServer): a public endpoint that bought with our key would let anyone spend our purse.
import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { makeServer } from "./mcp.mjs";

const PORT = Number(process.env.MCP_PORT ?? 8461);
const HOST = process.env.HOST ?? "127.0.0.1";
const MAX_BODY = 64 * 1024;

createServer(async (req, res) => {
  if (req.url !== "/mcp" && req.url !== "/mcp/") {
    res.writeHead(404, { "content-type": "application/json" });
    return res.end(JSON.stringify({ error: "MCP lives at /mcp" }));
  }
  if (req.method !== "POST") {
    // No server-initiated stream and no sessions to delete in stateless mode.
    res.writeHead(405, { allow: "POST", "content-type": "application/json" });
    return res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "POST only" }, id: null }));
  }
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) { res.writeHead(413); return res.end(); }
  }
  let body;
  try { body = JSON.parse(raw); } catch {
    res.writeHead(400, { "content-type": "application/json" });
    return res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "parse error" }, id: null }));
  }
  const server = makeServer({ houseMayBuy: false });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "internal error" }, id: null }));
    }
  }
}).listen(PORT, HOST, () => console.log(`agent-trust MCP over HTTP on ${HOST}:${PORT}/mcp`));
