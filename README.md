# Does this agent deserve its reputation?

**Provenance for ERC-8004 reputation on Monad, from a service that buys its own inputs and shows
its own bill.**

The registry counts ratings. On Monad that count is self-produced:

- **10,252** agents registered, **84** ever rated
- **9,188** ratings in total, and **99.7% of them landed in three days of February 2026**
- On the most-rated agent, **7,665 ratings from 7,665 wallets, every one of them funded by that
  agent's own owner** seconds before it rated
- Across the whole chain, ratings that survive both provenance filters: **3**

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
returns a First Funder edge for a wallet, for $0.01, paid over x402 on Monad with no account and no
key. Six lookups on agent #182 cost six cents and all six returned the same first funder: the
agent's own owner. A second source, bought rather than assumed, agreeing with the free half.

**Dynamic.** The wallet does work. Every wallet question costs real money out of the agent's
address, and when it runs dry the service stops answering, so the page shows the balance as *how
many more questions it can afford* and lets a visitor top it up with a USDC transfer they approve
in the confirmation dialog. Sign-in creates the wallet; the transfer is what it is for.

## Our own bill

The service pays for its answers and publishes what that cost, because a service that judges other
people's honesty should not hide its own inputs. `GET /spend` at any moment; at the time of writing:

**15 calls, 11 delivered, and the chain says $0.11.**

Our own per-call ledger first said $0.15 with one call "paid and nothing returned". Both figures
were wrong: four rejected calls never settled at all, and one of them had booked a neighbouring
call's transfer because its reconciliation window opened five blocks before the request. The full
on-chain pass (`src/reconcile.mjs`) assigns every USDC transfer to exactly one delivered answer:
eleven transfers for eleven answers, and Nansen never took a cent it did not answer for. The wrong
ledger stays in the repo history on purpose, because it is the project's thesis demonstrated on
the project itself: every count is produced by someone, including ours, and the chain is the only
book that balances.

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

## What this is not

It is not a new idea. Trust verdicts for agents are sold over x402 on Base today (PHION, KYA,
biii), fulfilment verification exists (vet402), and shared first-funder provenance as a Sybil
detector is published research (arXiv 2606.26028, which measured coordinated reviewers at 73.5%,
59.2% and 90.6% on Ethereum, BSC and Base).

What is new here is the chain and the evidence. No agent-trust service exists on Monad: of 1,533
live x402 resources there, seven domains sell anything at all and none of them sell this. The
February farm is our own measurement, published before this project existed. And the mechanic of
paying per call for the inputs to a trust answer, with the bill in public, we have not found
anywhere.

Limits worth stating: provenance is computed for agents with at least five ratings (28 agents,
9,118 of 9,188 events); purchased corroboration is sampled, not exhaustive, because each lookup
costs money; and a payment routed through a contract, a multisig or an exchange would not be seen,
so the count of three independent raters is an upper bound rather than a floor.

Built for Metropolis, September 2026, by [ProofLines](https://prooflines.org/monad/).
