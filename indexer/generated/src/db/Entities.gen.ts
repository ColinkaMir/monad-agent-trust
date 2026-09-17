/* TypeScript file generated from Entities.res by genType. */

/* eslint-disable */
/* tslint:disable */

export type id = string;

export type whereOperations<entity,fieldType> = {
  readonly eq: (_1:fieldType) => Promise<entity[]>; 
  readonly gt: (_1:fieldType) => Promise<entity[]>; 
  readonly lt: (_1:fieldType) => Promise<entity[]>
};

export type Agent_t = {
  readonly agentURI: string; 
  readonly feedbackCount: number; 
  readonly id: id; 
  readonly owner: string; 
  readonly raterCount: number; 
  readonly registeredAt: bigint; 
  readonly registeredBlock: bigint; 
  readonly scoreSum: bigint
};

export type Agent_indexedFieldOperations = {};

export type AgentRater_t = {
  readonly agent_id: id; 
  readonly client: string; 
  readonly firstAt: bigint; 
  readonly id: id; 
  readonly ratings: number
};

export type AgentRater_indexedFieldOperations = {};

export type Feedback_t = {
  readonly agent_id: id; 
  readonly block: bigint; 
  readonly client: string; 
  readonly endpoint: string; 
  readonly id: id; 
  readonly tag1: string; 
  readonly timestamp: bigint; 
  readonly value: bigint; 
  readonly valueDecimals: number
};

export type Feedback_indexedFieldOperations = {};

export type Rater_t = {
  readonly agentsRated: number; 
  readonly firstRatedAt: bigint; 
  readonly id: id; 
  readonly lastRatedAt: bigint; 
  readonly ratingsGiven: number
};

export type Rater_indexedFieldOperations = {};
