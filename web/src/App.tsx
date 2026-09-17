import { useEffect, useState } from "react";
import {
  DynamicContextProvider,
  DynamicWidget,
  useDynamicContext,
} from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { FundAgent } from "./FundAgent";
import { FarmMap } from "./FarmMap";
import { Delegate } from "./Delegate";
import "./app.css";

const API = import.meta.env.VITE_API ?? "http://localhost:8460";
const ENV_ID = import.meta.env.VITE_DYNAMIC_ENV_ID ?? "";

// Monad mainnet, so the wallet that funds the agent and the chain the answers come from are
// the same place. Dynamic needs the network spelled out; it has no opinion about Monad by default.
// Dynamic renders inside a shadow DOM, so page CSS cannot reach it; these variables are the
// supported way in, and the names are taken from the installed SDK rather than from a blog post.
// Without this the widget is a white pill on a near-black page, which reads as somebody else's
// component dropped into ours.
const DYNAMIC_CSS = `
  .dynamic-shadow-dom {
    --dynamic-base-1: #0e1424;
    --dynamic-base-2: #0e1424;
    --dynamic-base-3: #161d31;
    --dynamic-base-4: #1c2440;
    --dynamic-text-primary: #eef1f6;
    --dynamic-text-secondary: #b9c4dd;
    --dynamic-text-tertiary: #8d99b5;
    --dynamic-text-link: #8f7bf8;
    --dynamic-brand-primary-color: #8f7bf8;
    --dynamic-border-radius: 10px;
    --dynamic-hover: #1c2440;
    --dynamic-success-1: #5ad1a5;
    --dynamic-error-1: #f0798f;
    --dynamic-connect-button-background: #0e1424;
    --dynamic-connect-button-color: #eef1f6;
    --dynamic-connect-button-border: 1px solid rgba(140, 160, 200, 0.14);
    --dynamic-connect-button-background-hover: #1c2440;
    --dynamic-shadow-down-1: none;
  }
`;

const MONAD = {
  blockExplorerUrls: ["https://monadexplorer.com/"],
  iconUrls: ["https://prooflines.org/monad/assets/favicon-proofline.svg"],
  chainId: 143,
  name: "Monad",
  nativeCurrency: { decimals: 18, name: "MON", symbol: "MON" },
  networkId: 143,
  rpcUrls: ["https://rpc.monad.xyz"],
  vanityName: "Monad",
};

type Verdict = {
  agentId: number;
  corroboration?: { bought: boolean; usdcSpent: number; ratersSampled: number; finding: string } | null;
  feedback: number;
  raters: number;
  ownerFunded: number;
  fullCycle: number;
  paidBefore: number;
  independentPaid: number;
  first: string;
  last: string;
  verdict: string;
  why: string;
};

type Spend = {
  calls: number;
  usdcSpent: number;
  delivered: number;
  paidButNotDelivered: number;
  missingSettlementHeader: number;
  purchases: { at: string; about: string; paidUsdc: number; tx: string | null; delivered: boolean }[];
};

const TONE: Record<string, string> = {
  farmed: "bad",
  "single-source": "bad",
  burst: "warn",
  thin: "warn",
  "partly-backed": "good",
  unknown: "warn",
};

function Answer() {
  const { primaryWallet } = useDynamicContext();
  const [query, setQuery] = useState("182");
  const [agent, setAgent] = useState<Verdict | null>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ask = async (q: string) => {
    setBusy(true); setError(""); setAgent(null); setWallet(null);
    try {
      const isAddress = /^0x[0-9a-fA-F]{40}$/.test(q.trim());
      const r = await fetch(`${API}/${isAddress ? "wallet" : "agent"}/${q.trim()}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      isAddress ? setWallet(d) : setAgent(d);
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { ask("182"); }, []);

  return (
    <>
      <div className="ask">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(query)}
          placeholder="agent id (182) or wallet address (0x…)"
          spellCheck={false}
        />
        <button onClick={() => ask(query)} disabled={busy}>
          {busy ? "asking…" : "ask"}
        </button>
      </div>
      <p className="hint">
        An agent id is answered from our index, free. An address also buys one Nansen signal for
        $0.01 over x402 on Monad, and the payment is reconciled on chain before it is shown.
        {primaryWallet ? ` Connected as ${primaryWallet.address.slice(0, 10)}…` : ""}
      </p>

      {error && <div className="card bad"><b>could not answer</b><p>{error}</p></div>}

      {agent && (
        <div className={`card ${TONE[agent.verdict] ?? "warn"}`}>
          <div className="verdict">{agent.verdict}</div>
          <h2>agent #{agent.agentId}</h2>
          <p className="why">{agent.why}</p>
          {agent.corroboration?.bought && (
            <div className="bought-line">
              <b>bought to check our own answer</b>
              <p>
                {agent.corroboration.finding} {agent.corroboration.ratersSampled} rater
                {agent.corroboration.ratersSampled === 1 ? "" : "s"} looked up, ${agent.corroboration.usdcSpent.toFixed(2)} spent.
              </p>
            </div>
          )}
          <table>
            <tbody>
              <tr><td>ratings</td><td>{agent.feedback}</td><td className="note">what the registry shows</td></tr>
              <tr><td>distinct raters</td><td>{agent.raters}</td><td className="note">wallets behind them</td></tr>
              <tr><td>funded by the owner</td><td className="bad-n">{agent.ownerFunded}</td><td className="note">the owner paid these wallets</td></tr>
              <tr><td>full cycle</td><td className="bad-n">{agent.fullCycle}</td><td className="note">owner paid them, they paid back</td></tr>
              <tr><td>paid before rating</td><td>{agent.paidBefore}</td><td className="note">customers, not recipients</td></tr>
              <tr><td>independent and paid</td><td className="good-n">{agent.independentPaid}</td><td className="note">survives both filters</td></tr>
              <tr><td>window</td><td colSpan={2}>{agent.first} … {agent.last}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {wallet && (
        <div className="card">
          <h2>{wallet.address}</h2>
          {wallet.ownsRatedAgents?.length ? (
            <ul>
              {wallet.ownsRatedAgents.map((a: any) => (
                <li key={a.agentId}>
                  owns agent #{a.agentId} — <b>{a.verdict}</b>: {a.why}
                </li>
              ))}
            </ul>
          ) : (
            <p className="why">This address owns no agent with enough ratings to judge.</p>
          )}
          <div className="bought">
            <b>bought signal</b>
            {wallet.purchasedSignal?.bought ? (
              <p>
                paid ${wallet.purchasedSignal.paidUsdc} USDC ·{" "}
                {wallet.purchasedSignal.reconciled ? "reconciled on chain" : "NOT found on chain"}{" "}
                {wallet.purchasedSignal.tx && (
                  <a href={`https://monadexplorer.com/tx/${wallet.purchasedSignal.tx}`} target="_blank">
                    {wallet.purchasedSignal.tx.slice(0, 12)}…
                  </a>
                )}
              </p>
            ) : (
              <p>not purchased ({wallet.purchasedSignal?.error ?? "skipped"})</p>
            )}
            <pre>{wallet.purchasedSignal?.preview}</pre>
          </div>
        </div>
      )}
    </>
  );
}

function Bill() {
  const [spend, setSpend] = useState<Spend | null>(null);
  useEffect(() => {
    fetch(`${API}/spend`).then((r) => r.json()).then(setSpend).catch(() => {});
  }, []);
  if (!spend) return null;
  return (
    <div className="bill">
      <b>our own bill</b>
      <span>{spend.calls} calls</span>
      <span>${spend.usdcSpent.toFixed(3)} spent</span>
      <span>{spend.delivered} delivered</span>
      {spend.paidButNotDelivered > 0 && <span className="bad-n">{spend.paidButNotDelivered} paid, nothing back</span>}
      {spend.missingSettlementHeader > 0 && <span className="warn-n">{spend.missingSettlementHeader} without a settlement header</span>}
    </div>
  );
}

export default function App() {
  return (
    <DynamicContextProvider
      theme="dark"
      settings={{
        environmentId: ENV_ID,
        walletConnectors: [EthereumWalletConnectors],
        overrides: { evmNetworks: [MONAD] },
        cssOverrides: DYNAMIC_CSS,
      }}
    >
      <div className="wrap">
        <header>
          <div>
            <h1>Does this agent deserve its reputation?</h1>
            <p className="lead">
              ERC-8004 counts ratings. On Monad that count is self-produced: 99.7% of all feedback
              landed in three days of February, and on the most-rated agent every rater had been
              funded by that agent's own owner eight seconds before rating it. This asks the two questions
              the registry cannot: did the rater pay first, and whose money was it.
            </p>
          </div>
          <div className="signin">
            {ENV_ID ? <DynamicWidget /> : <div className="nokey">set VITE_DYNAMIC_ENV_ID to enable sign-in</div>}
          </div>
        </header>
        <Answer />
        <FarmMap />
        <Delegate />
        <FundAgent />
        <Bill />
        <footer>
          Index built with Envio HyperSync over Monad mainnet · wallet signals bought from Nansen
          per call over x402 · every purchase reconciled against USDC transfer logs.
        </footer>
      </div>
    </DynamicContextProvider>
  );
}
