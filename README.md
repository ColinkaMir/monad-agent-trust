# Does this agent deserve its reputation?

**Provenance for ERC-8004 reputation on Monad, from a service that buys its own inputs and shows
its own bill.**

The registry counts ratings. On Monad that count is self-produced:

- **10,252** agents registered, **84** ever rated
- **9,188** ratings in total, and **99.7% of them landed in three days of February 2026**
- On the most-rated agent, **7,665 ratings from 7,665 wallets, every one of them funded by that
  agent's own owner** seconds before it rated
- Across the whole chain, ratings that survive both provenance filters: **3, from 2 wallets**, and
  buying the funding history of those two leaves **one** that nothing is known against

So this asks the two questions the registry cannot answer, and answers them in words rather than
with a score out of a hundred, because a score invites exactly the mistake this exists to correct:
reading a produced quantity as evidence.

    did the rater pay the agent BEFORE rating it?
    had the agent's owner funded that rater in the first place?

## Why a payment-backed score is not enough

The obvious fix for fake reviews is to weight a rating by whether the rater ever paid the agent.
On Monad that fix fails completely. On agent #182 **all 7,665 raters had paid the owner**, a median
of 10.93 MON each. The owner had funded them first: 84,283 MON out, 83,781 MON back, a median of
**six seconds** from funding to rating and six more from rating to the money returning.

A payment proves nothing on its own. Direction and provenance are what separate a customer from a
wallet that was paid to hold an opinion.

## What it does

| | |
|---|---|
| **Index** | Both ERC-8004 registries on Monad, plus the transfer history of every rated agent's owner |
| **Compute** | Per agent: distinct raters, how many the owner funded, how many paid before rating, how many survive both filters |
| **Buy** | The one fact Monad cannot show: who funded a rater *first, anywhere*. Bought from Nansen for $0.01 a call over x402, on Monad |
| **Serve** | HTTP, MCP tools, and a web page. Every answer carries what it cost and the transaction that paid for it |

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

So of 9,188 ratings, the ones that survive the free filters number three, they come from two
wallets, and after the purchase exactly one wallet on the entire chain has a clean provenance. The
label is what did that work: a shared funder means a farm when the funder is an ordinary wallet
and means nothing when it is an exchange or a distributor, and Monad cannot tell you which it is.

On agent #182 the same purchase agrees with the free half instead of correcting it: eleven
lookups, eleven cents, and every one of the eleven raters was first funded by that agent's own
owner. Two sources of different kinds reaching the same answer is the only reason to believe
either.

**Dynamic.** The wallet does work. Every wallet question costs real money out of the agent's
address, and when it runs dry the service stops answering, so the page shows the balance as *how
many more questions it can afford* and lets a visitor top it up with a USDC transfer they approve
in the confirmation dialog. Sign-in creates the wallet; the transfer is what it is for.

## Our own bill

The service pays for its answers and publishes what that cost, because a service that judges other
people's honesty should not hide its own inputs. `GET /spend` at any moment; at the time of writing:

**24 calls, 20 delivered, and the chain says $0.20.**

This project has now caught itself twice, and both are in the git history on purpose.

The per-call ledger over-stated the bill: a rejected call booked a neighbouring call's transfer,
because its reconciliation window opened five blocks before the request was even sent. The full
on-chain pass (`src/reconcile.mjs`) assigns every USDC transfer to exactly one delivered answer,
and the books balance: twenty transfers, twenty answers, and Nansen has never taken a cent
it did not answer for.

The provenance count over-stated independence, in the same shape as the thing this project was
built to expose. "Three independent ratings network-wide" was three *ratings* from two *wallets*,
because the total added up per-agent counts and one wallet is the whole independent record of two
different agents. That error needed no purchase to find, only the honesty to count the right noun,
and it is exactly the mistake a registry makes when it reports a number of ratings as a number of
opinions. Both figures are published now, and they differ.

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
node src/serve.mjs                  # HTTP on :8460
node src/mcp.mjs                    # MCP over stdio
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

Built for Metropolis, September 2026, by [ProofLines](https://prooflines.org/monad/).
