/*
 * Handlers for the two ERC-8004 registries on Monad.
 *
 * What these keep that a raw event dump does not: the rating VALUE (the registries emit it and
 * our first pass through HyperSync ignored it), a per-agent distinct-rater count maintained as
 * events arrive, and a Rater entity so "how many agents has this wallet rated" is a lookup rather
 * than a scan. Those three are what the farm pattern shows up in: one wallet, one rating, top
 * score, thousands of times.
 */
import {
  IdentityRegistry,
  ReputationRegistry,
  Agent,
  Feedback,
  Rater,
  AgentRater,
} from "generated";

IdentityRegistry.Registered.handler(async ({ event, context }) => {
  const id = event.params.agentId.toString();
  const existing = await context.Agent.get(id);
  const agent: Agent = {
    id,
    owner: event.params.owner.toLowerCase(),
    agentURI: event.params.agentURI,
    registeredAt: BigInt(event.block.timestamp),
    registeredBlock: BigInt(event.block.number),
    // A re-registration must not reset a rating history that already exists.
    feedbackCount: existing?.feedbackCount ?? 0,
    raterCount: existing?.raterCount ?? 0,
    scoreSum: existing?.scoreSum ?? 0n,
  };
  context.Agent.set(agent);
});

ReputationRegistry.NewFeedback.handler(async ({ event, context }) => {
  const agentId = event.params.agentId.toString();
  const client = event.params.clientAddress.toLowerCase();

  context.Feedback.set({
    id: `${event.transaction.hash}-${event.logIndex}`,
    agent_id: agentId,
    client,
    value: BigInt(event.params.value),
    valueDecimals: Number(event.params.valueDecimals),
    tag1: event.params.tag1,
    endpoint: event.params.endpoint,
    timestamp: BigInt(event.block.timestamp),
    block: BigInt(event.block.number),
  } as Feedback);

  // Feedback can land on an agent this indexer has not seen registered (the registry does not
  // stop it), so the row is created rather than skipped — dropping it would undercount exactly
  // the agents worth looking at.
  const agent = await context.Agent.get(agentId);
  const rater = await context.Rater.get(client);
  // Exact, not approximate: one row per (agent, rater) pair, so "distinct raters" is a fact
  // rather than a heuristic about what this wallet rated last.
  const pairId = `${agentId}-${client}`;
  const pair = await context.AgentRater.get(pairId);
  const firstTimeForThisAgent = !pair;
  context.AgentRater.set({
    id: pairId,
    agent_id: agentId,
    client,
    ratings: (pair?.ratings ?? 0) + 1,
    firstAt: pair?.firstAt ?? BigInt(event.block.timestamp),
  } as AgentRater);

  context.Agent.set({
    id: agentId,
    owner: agent?.owner ?? "",
    agentURI: agent?.agentURI ?? "",
    registeredAt: agent?.registeredAt ?? 0n,
    registeredBlock: agent?.registeredBlock ?? 0n,
    feedbackCount: (agent?.feedbackCount ?? 0) + 1,
    raterCount: (agent?.raterCount ?? 0) + (firstTimeForThisAgent ? 1 : 0),
    scoreSum: (agent?.scoreSum ?? 0n) + BigInt(event.params.value),
  } as Agent);

  context.Rater.set({
    id: client,
    ratingsGiven: (rater?.ratingsGiven ?? 0) + 1,
    agentsRated: (rater?.agentsRated ?? 0) + (firstTimeForThisAgent ? 1 : 0),
    firstRatedAt: rater?.firstRatedAt ?? BigInt(event.block.timestamp),
    lastRatedAt: BigInt(event.block.timestamp),
  } as Rater);
});
