# erc8004-monad — HyperIndex

Typed indexer over the two ERC-8004 registries on Monad mainnet, built with Envio HyperIndex.

The provenance pipeline in `../src` reads the same events through HyperSync directly, because it
also needs a second pass over the agent owners' transfer history, which an event indexer does not
model. This covers the registry half properly and serves it over GraphQL.

Run it:

```bash
ENVIO_API_TOKEN=$(cat ~/.envio-token) pnpm envio dev   # Postgres + Hasura in Docker
# GraphQL at http://localhost:8080/v1/graphql
```

## What it keeps that a raw event dump does not

**The rating value.** `NewFeedback` carries `value` and `valueDecimals`, and our first pass through
HyperSync threw both away. The event signature came from the implementation ABI behind the proxy,
not from a guess:

```
NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex,
            int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1,
            string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)
```

What the values look like is itself a finding. On the farmed agent #182, a sample of 200 ratings
holds two values and nothing else: `100` and a 1-followed-by-27-zeros, both with `decimals: 0`.
On agent #4, which has an independently paid rater, the values vary and carry sensible decimals:
`5000` and `10000` at two decimals, `96`, `1`. Produced ratings look produced.

**Exact distinct raters.** An `AgentRater` row per (agent, rater) pair. The cheap version — count a
rater as new when it differs from the one before — reported 375 raters for agent #9, which has
exactly one wallet behind all 518 of its ratings. The shortcut was wrong in the direction that
flatters a farm, so it had to go.

## Cross-check

Both pipelines, run independently, agree:

| agent | feedback | distinct raters |
|---|---|---|
| 182 | 7,665 | 7,665 |
| 9 | 518 | 1 |
| 87 | 508 | 1 |
| 8317 | 78 | 1 |
| 4 | 76 | 3 |
| 153 | 53 | 5 |

Full history from the deploy block to chain head, on the free tier's 30 requests a minute.
