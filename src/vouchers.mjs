// Delegated spending, so a visitor pays for their own questions without handing us their money.
//
// The old arrangement was a transfer into our wallet: custodial, unbounded, and irreversible. A
// visitor who wanted two answers had to trust us with a balance. This replaces it with EIP-3009
// authorizations, the same primitive x402 already settles with, signed by the visitor's embedded
// wallet and spent by the agent one question at a time.
//
// What that buys, precisely:
//   the money never touches us      — each authorization pays Nansen's address directly
//   the ceiling is what was signed  — ten vouchers of $0.01 is a $0.10 ceiling, not an allowance
//   it is revocable on chain        — cancelAuthorization(authorizer, nonce, v, r, s), verified
//                                      live on Monad USDC: a dummy signature reverts with
//                                      "FiatTokenV2: invalid signature", while a function that
//                                      does not exist reverts with no data at all
//   spent-ness is not our claim     — authorizationState(authorizer, nonce) is the chain's answer
//
// Nothing here is trusted from the client except a signature, and a signature that does not
// recover to the address that sent it is discarded before it is stored.
import { ethers } from "ethers";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

export const USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";
export const CHAIN_ID = 143;
const STORE = "data/vouchers.json";
// One voucher must not be able to move more than a question costs. A visitor signing a $0.01
// authorization has agreed to one lookup, not to whatever the seller decides to charge later.
export const PER_VOUCHER_CAP = 20_000n;   // 0.02 USDC, 6 decimals

export const DOMAIN = {
  name: "USDC", version: "2", chainId: CHAIN_ID, verifyingContract: USDC,
};
export const TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" }, { name: "to", type: "address" },
    { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
  ],
};

const load = () => (existsSync(STORE)
  ? JSON.parse(readFileSync(STORE, "utf8"))
  : { vouchers: [] });

const save = (db) => { mkdirSync("data", { recursive: true }); writeFileSync(STORE, JSON.stringify(db, null, 1)); };

/// Checks a voucher against the signature, the cap and the clock. Returns a reason string when
/// it fails, so the caller can tell a visitor which of their vouchers was rejected and why
/// rather than silently keeping nine of ten.
export function check(v, now = Math.floor(Date.now() / 1000)) {
  for (const k of ["from", "to", "value", "validAfter", "validBefore", "nonce", "signature"]) {
    if (v?.[k] === undefined) return `missing field ${k}`;
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(v.from)) return "from is not an address";
  if (!/^0x[0-9a-fA-F]{40}$/.test(v.to)) return "to is not an address";
  if (!/^0x[0-9a-fA-F]{64}$/.test(v.nonce)) return "nonce is not bytes32";
  let value;
  try { value = BigInt(v.value); } catch { return "value is not a number"; }
  if (value <= 0n) return "value is zero";
  if (value > PER_VOUCHER_CAP) return `value above the ${Number(PER_VOUCHER_CAP) / 1e6} USDC per-voucher cap`;
  if (Number(v.validBefore) <= now) return "already expired";
  if (Number(v.validAfter) > now) return "not valid yet";

  const message = {
    from: v.from, to: v.to, value: value,
    validAfter: BigInt(v.validAfter), validBefore: BigInt(v.validBefore), nonce: v.nonce,
  };
  let signer;
  try { signer = ethers.verifyTypedData(DOMAIN, TYPES, message, v.signature); }
  catch (e) { return `signature does not verify: ${String(e.shortMessage ?? e.message).slice(0, 80)}`; }
  // The whole security of this rests on one line: a voucher only spends the money of whoever
  // actually signed it, and we take the signer's word for nothing else.
  if (signer.toLowerCase() !== v.from.toLowerCase()) return "signature is from a different address";
  return null;
}

/// Stores vouchers that pass, reports the ones that do not. Duplicate nonces are rejected rather
/// than overwritten: the same nonce twice is either a replay or a client bug, and both deserve
/// to be visible.
export function accept(list) {
  const db = load();
  const known = new Set(db.vouchers.map((v) => `${v.from.toLowerCase()}|${v.nonce}`));
  const accepted = [], rejected = [];
  for (const v of list ?? []) {
    const why = check(v);
    if (why) { rejected.push({ nonce: v?.nonce ?? null, why }); continue; }
    const key = `${v.from.toLowerCase()}|${v.nonce}`;
    if (known.has(key)) { rejected.push({ nonce: v.nonce, why: "nonce already delegated" }); continue; }
    known.add(key);
    const row = {
      from: v.from.toLowerCase(), to: v.to.toLowerCase(), value: String(v.value),
      validAfter: String(v.validAfter), validBefore: String(v.validBefore),
      nonce: v.nonce, signature: v.signature,
      addedAt: new Date().toISOString(), spentAt: null, tx: null,
    };
    db.vouchers.push(row);
    accepted.push(row.nonce);
  }
  save(db);
  return { accepted, rejected };
}

/// What this address still has available, from our records. `onChain` is deliberately not
/// consulted here: the summary is cheap and frequent, and the chain is asked at spend time,
/// where being wrong actually costs something.
export function summary(address, now = Math.floor(Date.now() / 1000)) {
  const a = address.toLowerCase();
  const mine = load().vouchers.filter((v) => v.from === a);
  const live = mine.filter((v) => !v.spentAt && Number(v.validBefore) > now);
  const usdc = live.reduce((n, v) => n + Number(v.value) / 1e6, 0);
  return {
    address: a,
    delegated: mine.length,
    spent: mine.filter((v) => v.spentAt).length,
    expired: mine.filter((v) => !v.spentAt && Number(v.validBefore) <= now).length,
    questionsLeft: live.length,
    usdcLeft: +usdc.toFixed(6),
    expiresAt: live.length
      ? new Date(Math.min(...live.map((v) => Number(v.validBefore))) * 1000).toISOString()
      : null,
    nonces: live.map((v) => v.nonce),
  };
}

/// What the signer can actually pay right now. A signature is a promise about money, not money:
/// an authorization from an empty wallet verifies perfectly and settles never. Counting those as
/// available questions would be this project publishing exactly the kind of unbacked total it was
/// built to expose, so the balance is asked for and reported.
export async function balanceOf(address, provider) {
  const usdc = new ethers.Contract(
    USDC, ["function balanceOf(address) view returns (uint256)"], provider);
  try { return BigInt(await usdc.balanceOf(address)); } catch { return null; }
}

/// Signed vouchers, minus the ones the signer cannot currently cover. Returns both numbers,
/// because "you signed for five and can pay for two" is the honest sentence.
export async function fundedSummary(address, provider) {
  const base = summary(address);
  const balance = await balanceOf(address, provider);
  if (balance === null) return { ...base, usdcBalance: null, affordable: null };
  const each = 10_000n;
  const affordable = Math.min(base.questionsLeft, Number(balance / each));
  return {
    ...base,
    usdcBalance: +(Number(balance) / 1e6).toFixed(6),
    affordable,
    unfunded: base.questionsLeft - affordable,
  };
}

/// Picks one unspent voucher that matches what the seller is actually asking for right now, and
/// confirms with the chain that it has not been used or cancelled since we stored it.
///
/// The match matters: vouchers are signed ahead of time against the offer we saw then, and a
/// seller may change its price or its payout address afterwards. A voucher that no longer fits
/// the live offer is not spendable, and silently paying a different address than the visitor
/// signed for would be the exact betrayal this design exists to avoid.
export async function pick(address, { payTo, amount, provider }, now = Math.floor(Date.now() / 1000)) {
  const db = load();
  const a = address.toLowerCase();
  const want = BigInt(amount);
  const candidates = db.vouchers.filter((v) =>
    v.from === a && !v.spentAt && Number(v.validBefore) > now + 30
    && v.to === payTo.toLowerCase() && BigInt(v.value) === want);
  if (!candidates.length) return null;

  // An authorization the signer cannot cover would be handed to the facilitator, fail at
  // settlement, and cost a request and a confusing error. Check the money before spending the
  // promise.
  const balance = await balanceOf(a, provider);
  if (balance !== null && balance < want) return null;

  const usdc = new ethers.Contract(
    USDC, ["function authorizationState(address,bytes32) view returns (bool)"], provider);
  for (const v of candidates) {
    let used = false;
    try { used = await usdc.authorizationState(v.from, v.nonce); } catch { used = false; }
    if (used) { v.spentAt = v.spentAt ?? new Date().toISOString(); v.tx = v.tx ?? "used-elsewhere"; continue; }
    save(db);
    return v;
  }
  save(db);
  return null;
}

/// Marks a voucher spent. Called after the purchase, with whatever the chain said about it.
export function markSpent(nonce, from, tx) {
  const db = load();
  const v = db.vouchers.find((x) => x.nonce === nonce && x.from === from.toLowerCase());
  if (!v) return false;
  v.spentAt = new Date().toISOString();
  v.tx = tx ?? null;
  save(db);
  return true;
}
