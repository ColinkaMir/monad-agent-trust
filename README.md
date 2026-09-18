# Does this agent deserve its reputation?

**Provenance for ERC-8004 reputation on Monad, from a service that buys its own inputs and shows
its own bill.**

Live: **https://prooflines.org/monad/agent-trust/** (API under `/api`, MCP over stdio)

The registry counts ratings. On Monad that count is self-produced:

- **10,252** agents registered, **84** ever rated
- **9,188** ratings in total, and **99.7% of them landed in three days of February 2026**
- On the most-rated agent, **7,665 ratings from 7,665 wallets, every one of them funded by that
  agent's own owner** seconds before it rated
- Ratings that survive both provenance filters, across the whole chain: **16 of 9,188**. They come
  from **2 wallets**, and one of those two produced 15 of the 16 by rating the same two agents over
  and over. Buying the funding history of both leaves **one wallet** that nothing is known against

So this asks the two questions the registry cannot answer, and answers them in words rather than
with a score out of a hundred, because a score invites exactly the mistake this exists to correct:
reading a produced quantity as evidence.

    did the rater pay the agent BEFORE rating it?
    had the agent's owner funded that rater in the first place?

## Why a payment-backed score is not enough

The obvious fix for fake reviews is to weight a rating by whether the rater ever paid the agent.
On Monad that fix fails completely. On agent #182 **all 7,665 raters had paid the owner**, a median
of 11 MON each. The owner had funded them first: 84,282.5 MON out and 83,781.2 MON back, a median
of **eight seconds** from funding to rating and four more from rating to the money coming home.
**99.9% of those round trips closed inside half a minute.**

Every figure in that paragraph is recomputed by `src/score.mjs` from `data/indexed.json`, which is
in this repo. It had to be: an earlier draft of this file published six seconds and six, and 10.93
MON, from a working note nobody could check, and the index had thrown the transfer amounts away
after reading them. Numbers that cannot be recomputed are the thing this project objects to.

A payment proves nothing on its own. Direction and provenance are what separate a customer from a
wallet that was paid to hold an opinion.

## What it does

| | |
|---|---|
| **Index** | Both ERC-8004 registries on Monad, plus the transfer history of every rated agent's owner |
| **Compute** | Per agent: distinct raters, how many the owner funded, how many paid before rating, how many survive both filters |
| **Buy** | The one fact Monad cannot show: who funded a rater *first, anywhere*. Bought from Nansen for $0.01 a call over x402, on Monad |
| **Serve** | HTTP, MCP tools, and a web page. Every answer carries what it cost and the transaction that paid for it |
| **Show** | All 9,188 ratings drawn one dot each, because the claim is a ratio of 16 to 9,188 and a table reads that as "some good, some bad" |

Verdicts are `farmed`, `single-source`, `burst`, `partly-backed`, `thin`, or `not covered`, each
with the sentence that justifies it. `not covered` is a real answer: 84 of 10,252 agents have ever
been rated, so most questions have no evidence either way and saying so beats inventing a number.

## The sponsor stack, and what each part actually carries

**Envio.** Two pipelines, both real work. `indexer/` is a HyperIndex project with a typed schema
over both registries: it recovered the rating **value** our first pass discarded, and an exact
distinct-rater count. `src/index-erc8004.mjs` uses HyperSync directly for the part an event indexer
does not model, the owners' transfer history: one owner here has 15,411 transactions and explorer
pagination caps at 1,000 rows a page. Full history in 46s, catch-up in **0.18s**, on the free
tier's 30 requests a minute. The two pipelines are independent and agree on every covered agent,
which is the only reason to trust either.

**Nansen.** Not a panel of their data; an input to a verdict. `/profiler/address/related-wallets`
returns a First Funder edge and an entity label for a wallet, for $0.01, paid over x402 on Monad
with no account and no key. This is not a second opinion on something we already knew: a Monad
index can only see funding that happened on Monad, so without the purchase an owner who funds
their raters from any other chain reads as absent, and the agent reads as clean.

It decided the headline. A few cents bought the funding history of everything this chain has that
looks independent, and the answer came back split:

| Wallet | Rated | First funder | Verdict |
|---|---|---|---|
| `0x794c94f1` | agent 4 | `0xdf747918` | Nansen labels it **🤖 Distributor**, a wallet whose business is funding many wallets. Independent of *this* owner, not independent of everyone |
| `0x071a21c5` | agents 145 **and** 146 | `0x0311a7fd` | unlabelled, and neither owner. Nothing known against it |

So the free filters leave 16 ratings out of 9,188, produced by 2 wallets across 3 agents, and
after the purchase exactly one of those wallets has a provenance with nothing against it. The
label is what did that work: a shared funder means a farm when the funder is an ordinary wallet
and means nothing when it is an exchange or a distributor, and Monad cannot tell you which it is.

Exactly what is used, so this can be checked rather than taken on trust:

| | |
|---|---|
| Endpoint | `POST /api/v1/profiler/address/related-wallets` (Profiler), body `{address, chain}` |
| Also called | `/profiler/address/first-funder` (chain must be `all`), `/profiler/address/current-balance` |
| Data categories | First Funder edges, and the entity label attached to the funding address |
| Access | x402 on Monad, $0.01 a call, no account and no API key. Payment signed as EIP-3009 and settled against USDC at `0x754704Bc…` |
| Where it lands | `src/buy-nansen.mjs` buys, `src/enrich-nansen.mjs` samples a rater set, `src/serve.mjs` folds it into the verdict, `src/mcp.mjs` exposes it as a tool |
| What it decided | The label on one funder turned "independent" into "independent of this owner, not of everyone". Without it the headline is wrong |

On agent #182 the same purchase agrees with the free half instead of correcting it: eleven
lookups, eleven cents, and every one of the eleven raters was first funded by that agent's own
owner. Two sources of different kinds reaching the same answer is the only reason to believe
either.

**Dynamic.** Sign-in creates a wallet; what the wallet then does is delegate spending, which is a
different thing from holding a balance.

The first version had visitors top up the agent's purse with a USDC transfer. That is custodial,
unbounded and gone once sent. Now a visitor signs one EIP-3009 authorization per question they
want, $0.01 each, valid for a day. The agent spends them one at a time, and each payment moves
from the visitor straight to Nansen: we never hold anyone's money, the ceiling is exactly what was
signed rather than an allowance somebody could drain, and unspent authorizations are cancelled
with `cancelAuthorization` on USDC, which is a transaction the visitor sends rather than a favour
we grant. Verified on Monad mainnet before it was built on: a dummy signature to that function
reverts with `FiatTokenV2: invalid signature`, while a function that does not exist reverts with
no data at all.

The open question was whether a facilitator would settle an authorization signed hours earlier,
since an ordinary x402 payment is signed seconds before it is spent and given a five-minute
window. It does: a voucher with a 24-hour window settled against Nansen's live endpoint, tx
`0xb38442db…`. That is the whole mechanism, tested with real money rather than assumed.

Both Dynamic primitives are in play, which is what their brief asks for: an embedded wallet for
the visitor, an agent wallet that executes, and delegated access between them. `POST /delegate`
takes the signatures, `GET /delegation/:address` says what is left, and an answer states whose
money paid for it.

## Our own bill

The service pays for its answers and publishes what that cost, because a service that judges other
people's honesty should not hide its own inputs. `GET /spend` at any moment; at the time of writing:

**27 calls, 23 delivered, and the chain says $0.23.**

This project has now caught itself twice, and both are in the git history on purpose.

The per-call ledger over-stated the bill: a rejected call booked a neighbouring call's transfer,
because its reconciliation window opened five blocks before the request was even sent. The full
on-chain pass (`src/reconcile.mjs`) assigns every USDC transfer to exactly one delivered answer,
and the books balance: twenty-three transfers, twenty-three answers, and Nansen has never
taken a cent it did not answer for.

The provenance count over-stated independence, in the same shape as the thing this project was
built to expose. The total was published as "three independent ratings network-wide" and it was
not a count of ratings at all: it was three (agent, wallet) pairs, produced by two wallets, which
between them account for sixteen entries in the registry. One field, three different nouns, and
the label on it was the wrong one. That needed no purchase to find, only the willingness to ask
what was being counted, and it is precisely the mistake a registry makes when it reports a number
of ratings as a number of opinions. All three are now published under their own names.

The wider point stands on the other sellers: in our September survey of every x402 seller on
Monad, 7 of 19 paid calls took the money and answered with an error, and one returned HTTP 200
with no settlement header, so a client trusting the seller's accounting mis-counts its own
spending in both directions.

## Running it

```bash
node src/index-erc8004.mjs          # index (add --full to rebuild from the deploy block)
node src/score.mjs                  # compute provenance -> data/provenance.json
node src/enrich-nansen.mjs 182 --live --sample 6   # buy first-funder edges, $0.01 each
node src/reconcile.mjs              # re-derive the bill from USDC transfer logs -> data/settlement.json
node src/farm-map.mjs               # classify every rating for the picture -> web/public/farm.json
node src/serve.mjs                  # HTTP on :8460
node src/mcp.mjs                    # MCP over stdio
curl 'localhost:8460/wallet/0xabc…?payer=0xyou'   # spends one of the payer's delegated vouchers
cd web && npm run build && npm run preview        # the page
cd indexer && ENVIO_API_TOKEN=... pnpm envio dev  # HyperIndex + GraphQL on :8080
```

`~/.envio-token` for HyperSync, a funded Monad wallet for the x402 purchases. Nothing else.

## What is new, and what we checked before building

New is the combination: a trust answer whose inputs are bought one call at a time, priced, and
published with the bill attached. We went looking for that on any chain and did not find it. New
also are the chain and the evidence. No agent-trust service exists on Monad (of 1,533 live x402
resources there, seven domains sell anything at all and none of them sell this), and the February
farm is our own measurement, published on 10 September, inside this build window.

The parts are old, and we checked them first rather than afterwards. Trust verdicts for agents are
sold over x402 on Base today (PHION, KYA, biii), fulfilment verification exists (vet402), and
shared first-funder provenance as a Sybil detector is published research (arXiv 2606.26028, which
measured coordinated reviewers at 73.5%, 59.2% and 90.6% on Ethereum, BSC and Base). Two earlier
directions of ours died on that same check before a line of code was written, which is what the
check is for.

Limits: provenance is computed for agents with at least five ratings (28 agents,
9,118 of 9,188 events); purchased corroboration is sampled, not exhaustive, because each lookup
costs money; and a payment routed through a contract, a multisig or an exchange would not be seen,
so even the one wallet left standing is an upper bound rather than a floor. That upper bound has
already moved once: it was three before we bought the funding history, and buying it is what
turned three ratings into two wallets into one.

## License

GPL-3.0-only. The full text is in [LICENSE](LICENSE).

Built for Metropolis, September 2026, by [ProofLines](https://prooflines.org/monad/).
