#!/usr/bin/env node
// Simulate the two USDC authorisation calls the delegated-spend path depends on, without spending
// anything. We established both by hand in September, on mainnet, with real money: a garbage
// signature answered `ECRecover: invalid signature 'v' value` and a function that does not exist reverted
// with no data, which is how we learned `cancelAuthorization` is actually there. Tenderly's Pro
// licence from the Metropolis perk means that evidence can be reproduced by anyone, on demand,
// for nothing.
//
// Usage:
//   node tools/simulate-eip3009.mjs cancel <authorizer> <nonce> [signature]
//   node tools/simulate-eip3009.mjs transfer <from> <to> <value> <validAfter> <validBefore> <nonce> <signature>
//
// Credentials: ~/.tenderly-token (0600) and ~/.tenderly-project holding "account-slug/project-slug"
// exactly as they appear in the dashboard URL, dashboard.tenderly.co/<account>/<project>.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ethers } from "ethers";

const USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";
const CHAIN_ID = 143;
// Any address works as the simulated sender: these calls carry their own signature, so the caller
// is a relayer and not the payer. Ours is used so the trace reads like production.
const RELAYER = "0x9E66867adfDC613891A96d82a53988829cD39004";

const read = (name) => {
  try {
    return readFileSync(join(homedir(), name), "utf8").trim();
  } catch {
    console.error(`missing ~/${name}`);
    if (name === ".tenderly-project") {
      console.error("write it as: printf '%s' 'account-slug/project-slug' > ~/.tenderly-project");
      console.error("both slugs are visible in the dashboard URL after signing in");
    }
    process.exit(1);
  }
};

const IFACE = new ethers.Interface([
  "function cancelAuthorization(address authorizer, bytes32 nonce, bytes signature)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature)",
]);

function encode(argv) {
  const [kind, ...rest] = argv;
  if (kind === "cancel") {
    const [authorizer, nonce, signature = "0x" + "11".repeat(65)] = rest;
    if (!authorizer || !nonce) return null;
    return IFACE.encodeFunctionData("cancelAuthorization", [authorizer, nonce, signature]);
  }
  if (kind === "transfer") {
    const [from, to, value, validAfter, validBefore, nonce, signature] = rest;
    if (!signature) return null;
    return IFACE.encodeFunctionData("transferWithAuthorization", [
      from, to, value, validAfter, validBefore, nonce, signature,
    ]);
  }
  return null;
}

const input = encode(process.argv.slice(2));
if (!input) {
  console.error(readFileSync(new URL(import.meta.url)).toString().split("\n").slice(9, 13).join("\n"));
  process.exit(1);
}

const token = read(".tenderly-token");
const [account, project] = read(".tenderly-project").split("/");
if (!account || !project) {
  console.error("~/.tenderly-project must look like account-slug/project-slug");
  process.exit(1);
}

const res = await fetch(
  `https://api.tenderly.co/api/v1/account/${account}/project/${project}/simulate`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Access-Key": token },
    body: JSON.stringify({
      network_id: String(CHAIN_ID),
      from: RELAYER,
      to: USDC,
      input,
      gas: 500_000,
      gas_price: "0",
      value: "0",
      save: true,
      save_if_fails: true,
      simulation_type: "full",
    }),
  }
);

if (!res.ok) {
  console.error(`tenderly returned HTTP ${res.status}`);
  console.error((await res.text()).slice(0, 400));
  process.exit(1);
}

const body = await res.json();
const tx = body.transaction ?? {};
const info = tx.transaction_info ?? {};
// A revert is the expected outcome for most of what we simulate here, so the reason is the answer,
// not an error. Printing it plainly is the whole point: a named refusal proves the function exists
// and rejected us, while an empty revert means there is no such function at all.
//
// Note on Tenderly and Monad, measured 2026-09-22: the simulator reports these reverts as a bare
// "REVERT" and does not decode the Error(string) the contract returns, so the reason still has to
// be read from an eth_call against the chain. The trace link is still useful; the string is not there.
console.log("status      :", tx.status === true ? "success" : "reverted");
console.log("tenderly    :", info.error_message ?? tx.error_message ?? "(none)");
console.log("gas used    :", tx.gas_used ?? "(n/a)");
if (body.simulation?.id) {
  console.log("trace       :", `https://dashboard.tenderly.co/${account}/${project}/simulator/${body.simulation.id}`);
}

// The reason, read from the chain because the simulator does not carry it. One eth_call, no state
// change, no gas: the same request the wallet makes before it lets a user sign.
const rpc = process.env.MONAD_RPC
  ?? (() => { try { return read(".quicknode-monad-url"); } catch { return "https://rpc.monad.xyz"; } })();
const call = await fetch(rpc, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "eth_call",
    params: [{ from: RELAYER, to: USDC, data: input }, "latest"],
  }),
}).then((r) => r.json());

const revertData = call.error?.data ?? call.error?.message;
let reason = "(the call did not revert)";
if (typeof revertData === "string" && revertData.startsWith("0x08c379a0")) {
  reason = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + revertData.slice(10))[0];
} else if (call.error) {
  reason = `${call.error.message ?? "reverted"}${revertData ? ` (${String(revertData).slice(0, 20)}…)` : ""}`;
}
console.log("chain says  :", reason);
