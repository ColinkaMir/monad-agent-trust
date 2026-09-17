import { useCallback, useEffect, useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import { encodeFunctionData } from "viem";

const API = import.meta.env.VITE_API ?? "http://localhost:8460";
const USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" as const;
const NANSEN_PAYTO = "0x93053f1e7A5eFEDa532Fe69CbbE43cBEc3A0F13f" as const;
const PRICE = 10_000n;              // $0.01, USDC has six decimals
const WINDOW_HOURS = 24;

const DOMAIN = { name: "USDC", version: "2", chainId: 143, verifyingContract: USDC } as const;
const TRANSFER_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" }, { name: "to", type: "address" },
    { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
  ],
} as const;
const CANCEL_TYPES = {
  CancelAuthorization: [
    { name: "authorizer", type: "address" }, { name: "nonce", type: "bytes32" },
  ],
} as const;
const CANCEL_ABI = [{
  name: "cancelAuthorization", type: "function", stateMutability: "nonpayable",
  inputs: [{ name: "authorizer", type: "address" }, { name: "nonce", type: "bytes32" },
           { name: "v", type: "uint8" }, { name: "r", type: "bytes32" }, { name: "s", type: "bytes32" }],
  outputs: [],
}] as const;

type Summary = {
  address: string; delegated: number; spent: number; expired: number;
  questionsLeft: number; usdcLeft: number; expiresAt: string | null; nonces: string[];
  // Signed and payable are different numbers: an authorization from an empty wallet verifies
  // perfectly and settles never.
  usdcBalance: number | null; affordable: number | null; unfunded?: number;
};

const randomNonce = () => {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return ("0x" + [...b].map((x) => x.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
};

// v, r, s the contract wants, taken off the 65-byte signature by hand so this does not depend on
// which helper a given viem version exports.
const split = (sig: string) => ({
  r: `0x${sig.slice(2, 66)}` as `0x${string}`,
  s: `0x${sig.slice(66, 130)}` as `0x${string}`,
  v: Number.parseInt(sig.slice(130, 132), 16),
});

/**
 * Delegated spending, which is what the embedded wallet is actually for here.
 *
 * Asking a paid question costs $0.01 to Nansen. The obvious way to cover that is to have the
 * visitor send us a balance, and that was the first version: custodial, unbounded, and gone once
 * sent. This instead has the visitor sign one EIP-3009 authorization per question they want. The
 * agent spends them one at a time, each payment goes from the visitor straight to Nansen, and
 * what is unspent can be cancelled on chain.
 *
 * So the ceiling is exactly what was signed, we never hold anyone's money, and revocation does
 * not depend on us honouring a request: cancelAuthorization is a function on USDC.
 */
export function Delegate() {
  const { primaryWallet } = useDynamicContext();
  const [summary, setSummary] = useState<Summary | null>(null);
  // One by default. Each question needs its own authorization, so "5" means five wallet prompts
  // in a row, and a person who is not expecting that reads it as the dialog failing and
  // reopening. It is opt-in, and the button says how many prompts it will cost.
  const [count, setCount] = useState(1);
  const [state, setState] = useState<{ busy?: string; done?: string; error?: string }>({});

  const address = primaryWallet?.address ?? null;

  const refresh = useCallback(() => {
    if (!address) return setSummary(null);
    fetch(`${API}/delegation/${address}`).then((r) => r.json()).then(setSummary).catch(() => {});
  }, [address]);
  useEffect(() => { refresh(); }, [refresh]);

  const delegate = async () => {
    if (!primaryWallet || !address) return;
    setState({ busy: `signing 1 of ${count}…` });
    try {
      if (!isEthereumWallet(primaryWallet)) throw new Error("connect an EVM wallet");
      const client = await primaryWallet.getWalletClient();
      const now = Math.floor(Date.now() / 1000);
      // Each signature is sent the moment it exists. The first version collected all of them and
      // posted once at the end, so stopping halfway through threw away every signature already
      // given: the work was done and nothing was kept.
      let kept = 0;
      for (let i = 0; i < count; i++) {
        setState({ busy: count > 1 ? `signing ${i + 1} of ${count}…` : "confirm in your wallet…" });
        const message = {
          from: address as `0x${string}`, to: NANSEN_PAYTO, value: PRICE,
          validAfter: BigInt(now - 60), validBefore: BigInt(now + WINDOW_HOURS * 3600),
          nonce: randomNonce(),
        };
        const signature = await client.signTypedData({
          domain: DOMAIN, types: TRANSFER_TYPES,
          primaryType: "TransferWithAuthorization", message,
        });
        const r = await fetch(`${API}/delegate`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ vouchers: [{
            from: message.from, to: message.to, value: String(message.value),
            validAfter: String(message.validAfter), validBefore: String(message.validBefore),
            nonce: message.nonce, signature,
          }] }),
        });
        const j = await r.json();
        kept += j.accepted?.length ?? 0;
        setState({ busy: `${kept} of ${count} delegated…` });
        refresh();
      }
      setState({ done: `${kept} question${kept === 1 ? "" : "s"} delegated and ready` });
      refresh();
    } catch (e: any) {
      setState({ error: String(e?.shortMessage ?? e?.message ?? e).slice(0, 180) });
    }
  };

  // Revocation is a transaction against USDC, not a request to us. That distinction is the
  // reason to prefer this over a balance: the visitor does not have to be taken at our word.
  const revoke = async () => {
    if (!primaryWallet || !address || !summary?.nonces.length) return;
    try {
      if (!isEthereumWallet(primaryWallet)) throw new Error("connect an EVM wallet");
      const client = await primaryWallet.getWalletClient();
      let done = 0;
      for (const nonce of summary.nonces) {
        setState({ busy: `cancelling ${done + 1} of ${summary.nonces.length}…` });
        const signature = await client.signTypedData({
          domain: DOMAIN, types: CANCEL_TYPES, primaryType: "CancelAuthorization",
          message: { authorizer: address as `0x${string}`, nonce: nonce as `0x${string}` },
        });
        const { v, r, s } = split(signature);
        await client.sendTransaction({
          to: USDC,
          data: encodeFunctionData({
            abi: CANCEL_ABI, functionName: "cancelAuthorization",
            args: [address as `0x${string}`, nonce as `0x${string}`, v, r, s],
          }),
        });
        done++;
      }
      setState({ done: `${done} cancelled on chain` });
      setTimeout(refresh, 4000);
    } catch (e: any) {
      setState({ error: String(e?.shortMessage ?? e?.message ?? e).slice(0, 180) });
    }
  };

  if (!address) {
    return (
      <div className="fund">
        <div className="fund-head"><b>pay for your own questions</b></div>
        <p className="fund-hint">
          Sign in above and you can delegate a fixed number of paid lookups instead of topping up
          a shared purse. Each one pays Nansen directly from your wallet, and anything you do not
          use can be cancelled on chain.
        </p>
      </div>
    );
  }

  return (
    <div className="fund">
      <div className="fund-head">
        <b>your delegated questions</b>
        <span className="mono">{address.slice(0, 10)}…{address.slice(-6)}</span>
      </div>
      <p className="fund-line">
        {summary
          ? <><b>{summary.affordable ?? summary.questionsLeft} ready</b> of {summary.questionsLeft} signed
              {summary.spent ? `, ${summary.spent} spent` : ""}
              {summary.expired ? `, ${summary.expired} expired` : ""}.
              {" "}Your wallet holds ${(summary.usdcBalance ?? 0).toFixed(2)} USDC.</>
          : <>nothing delegated yet.</>}
      </p>
      {Boolean(summary?.unfunded) && (
        <p className="fund-err">
          {summary!.unfunded} signed {summary!.unfunded === 1 ? "authorisation" : "authorisations"} cannot
          be paid: this wallet has ${(summary!.usdcBalance ?? 0).toFixed(2)} USDC on Monad. A signature is a
          promise about money, not money. Send USDC to{" "}
          <span className="mono">{address}</span> and they become spendable, with no need to sign again.
        </p>
      )}
      <div className="fund-act">
        <input value={count} onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
               inputMode="numeric" />
        <span className="unit">questions</span>
        <button onClick={delegate} disabled={Boolean(state.busy)}>
          {state.busy ?? (count === 1
            ? `sign once, $${(Number(PRICE) / 1e6).toFixed(2)}`
            : `sign ${count} times, $${(Number(PRICE) / 1e6 * count).toFixed(2)}`)}
        </button>
        {Boolean(summary?.questionsLeft) && (
          <button className="ghost" onClick={revoke} disabled={Boolean(state.busy)}>cancel the rest</button>
        )}
      </div>
      <p className="fund-hint">
        <b>Your wallet asks once per question.</b> Choose 3 and it opens three times in a row; that
        is the signature dialog doing its job, not failing. Each one authorises $0.01 to Nansen and
        nothing else, is valid for {WINDOW_HOURS} hours, and is kept the moment you sign it, so
        stopping half way keeps what you already gave.
      </p>
      <p className="fund-hint">
        This service spends them one at a time and never holds the money. Unspent ones are
        cancelled with <span className="mono">cancelAuthorization</span> on USDC, which is a
        transaction you send, not a favour we grant.
      </p>
      {state.done && <p className="fund-hint">{state.done}</p>}
      {state.error && <p className="fund-err">{state.error}</p>}
    </div>
  );
}
