import { useEffect, useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import { encodeFunctionData, parseUnits } from "viem";

const API = import.meta.env.VITE_API ?? "http://localhost:8460";

const ERC20_TRANSFER = [{
  name: "transfer",
  type: "function",
  stateMutability: "nonpayable",
  inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
}] as const;

type Wallet = { address: string; usdc: number; mon: number; usdcToken: `0x${string}`; chainId: number };

/**
 * The part that makes the embedded wallet do work rather than decorate a header.
 *
 * Every answer about a wallet costs a real $0.01 paid to Nansen over x402. That money comes from
 * the agent's own address, and when it runs out the service stops being able to answer. So the
 * visitor's wallet and the agent's wallet are connected by an actual transfer, signed in the
 * confirmation dialog, not by a "connect" button that proves nothing.
 */
export function FundAgent() {
  const { primaryWallet } = useDynamicContext();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [amount, setAmount] = useState("0.10");
  const [state, setState] = useState<{ busy?: boolean; tx?: string; error?: string }>({});

  const refresh = () =>
    fetch(`${API}/agent-wallet`).then((r) => r.json()).then(setWallet).catch(() => {});
  useEffect(() => { refresh(); }, []);

  const fund = async () => {
    if (!primaryWallet || !wallet) return;
    setState({ busy: true });
    try {
      if (!isEthereumWallet(primaryWallet)) throw new Error("connect an EVM wallet");
      const client = await primaryWallet.getWalletClient();
      const hash = await client.sendTransaction({
        to: wallet.usdcToken,
        data: encodeFunctionData({
          abi: ERC20_TRANSFER,
          functionName: "transfer",
          args: [wallet.address as `0x${string}`, parseUnits(amount || "0", 6)],
        }),
      });
      setState({ tx: hash });
      // The balance moves a block later; asking immediately would show the old number and make
      // the transfer look like it failed.
      setTimeout(refresh, 4000);
    } catch (e: any) {
      // The raw revert is "ERC20: transfer amount exceeds balance", which tells a visitor who has
      // just created a fresh wallet nothing about what went wrong or what to do next.
      const raw = String(e?.shortMessage ?? e?.message ?? e);
      setState({ error: /exceeds balance|insufficient funds/i.test(raw)
        ? `Your wallet does not hold ${amount} USDC on Monad. A wallet made a moment ago is empty; `
          + "send it USDC first, or skip this and read the free half of every answer."
        : raw.slice(0, 180) });
    }
  };

  if (!wallet) return null;

  const calls = Math.floor(wallet.usdc / 0.01);

  return (
    <div className="fund">
      <div className="fund-head">
        <b>the agent's purse</b>
        <span className="mono">{wallet.address.slice(0, 10)}…{wallet.address.slice(-6)}</span>
      </div>
      <p className="fund-line">
        <b>${wallet.usdc.toFixed(3)} USDC</b> — about {calls} more question{calls === 1 ? "" : "s"} it
        can afford, at $0.01 a call. {wallet.mon.toFixed(2)} MON for gas.
      </p>
      {primaryWallet ? (
        <div className="fund-act">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          <span className="unit">USDC</span>
          <button onClick={fund} disabled={state.busy}>
            {state.busy ? "confirm in your wallet…" : "top it up"}
          </button>
        </div>
      ) : (
        <p className="fund-hint">
          Sign in above to top it up from your own wallet. The transfer is an ordinary USDC send on
          Monad; you approve it in the confirmation dialog.
        </p>
      )}
      {state.tx && (
        <p className="fund-hint">
          sent —{" "}
          <a href={`https://monadexplorer.com/tx/${state.tx}`} target="_blank" rel="noreferrer">
            {state.tx.slice(0, 14)}…
          </a>
        </p>
      )}
      {state.error && <p className="fund-err">{state.error}</p>}
    </div>
  );
}
