/* TypeScript file generated from Types.res by genType. */

/* eslint-disable */
/* tslint:disable */

import type {AgentRater_t as Entities_AgentRater_t} from '../src/db/Entities.gen';

import type {Agent_t as Entities_Agent_t} from '../src/db/Entities.gen';

import type {Feedback_t as Entities_Feedback_t} from '../src/db/Entities.gen';

import type {HandlerContext as $$handlerContext} from './Types.ts';

import type {HandlerWithOptions as $$fnWithEventConfig} from './bindings/OpaqueTypes.ts';

import type {LoaderContext as $$loaderContext} from './Types.ts';

import type {Rater_t as Entities_Rater_t} from '../src/db/Entities.gen';

import type {SingleOrMultiple as $$SingleOrMultiple_t} from './bindings/OpaqueTypes';

import type {entityHandlerContext as Internal_entityHandlerContext} from 'envio/src/Internal.gen';

import type {eventOptions as Internal_eventOptions} from 'envio/src/Internal.gen';

import type {genericContractRegisterArgs as Internal_genericContractRegisterArgs} from 'envio/src/Internal.gen';

import type {genericContractRegister as Internal_genericContractRegister} from 'envio/src/Internal.gen';

import type {genericEvent as Internal_genericEvent} from 'envio/src/Internal.gen';

import type {genericHandlerArgs as Internal_genericHandlerArgs} from 'envio/src/Internal.gen';

import type {genericHandlerWithLoader as Internal_genericHandlerWithLoader} from 'envio/src/Internal.gen';

import type {genericHandler as Internal_genericHandler} from 'envio/src/Internal.gen';

import type {genericLoaderArgs as Internal_genericLoaderArgs} from 'envio/src/Internal.gen';

import type {genericLoader as Internal_genericLoader} from 'envio/src/Internal.gen';

import type {logger as Envio_logger} from 'envio/src/Envio.gen';

import type {t as Address_t} from 'envio/src/Address.gen';

export type id = string;
export type Id = id;

export type contractRegistrations = {
  readonly log: Envio_logger; 
  readonly addIdentityRegistry: (_1:Address_t) => void; 
  readonly addReputationRegistry: (_1:Address_t) => void
};

export type entityLoaderContext<entity,indexedFieldOperations> = {
  readonly get: (_1:id) => Promise<(undefined | entity)>; 
  readonly getOrThrow: (_1:id, message:(undefined | string)) => Promise<entity>; 
  readonly getWhere: indexedFieldOperations; 
  readonly getOrCreate: (_1:entity) => Promise<entity>; 
  readonly set: (_1:entity) => void; 
  readonly deleteUnsafe: (_1:id) => void
};

export type loaderContext = $$loaderContext;

export type entityHandlerContext<entity> = Internal_entityHandlerContext<entity>;

export type handlerContext = $$handlerContext;

export type agent = Entities_Agent_t;
export type Agent = agent;

export type agentRater = Entities_AgentRater_t;
export type AgentRater = agentRater;

export type feedback = Entities_Feedback_t;
export type Feedback = feedback;

export type rater = Entities_Rater_t;
export type Rater = rater;

export type Transaction_t = { readonly hash: string };

export type Block_t = {
  readonly number: number; 
  readonly timestamp: number; 
  readonly hash: string
};

export type AggregatedBlock_t = {
  readonly hash: string; 
  readonly number: number; 
  readonly timestamp: number
};

export type AggregatedTransaction_t = { readonly hash: string };

export type eventLog<params> = Internal_genericEvent<params,Block_t,Transaction_t>;
export type EventLog<params> = eventLog<params>;

export type SingleOrMultiple_t<a> = $$SingleOrMultiple_t<a>;

export type HandlerTypes_args<eventArgs,context> = { readonly event: eventLog<eventArgs>; readonly context: context };

export type HandlerTypes_contractRegisterArgs<eventArgs> = Internal_genericContractRegisterArgs<eventLog<eventArgs>,contractRegistrations>;

export type HandlerTypes_contractRegister<eventArgs> = Internal_genericContractRegister<HandlerTypes_contractRegisterArgs<eventArgs>>;

export type HandlerTypes_loaderArgs<eventArgs> = Internal_genericLoaderArgs<eventLog<eventArgs>,loaderContext>;

export type HandlerTypes_loader<eventArgs,loaderReturn> = Internal_genericLoader<HandlerTypes_loaderArgs<eventArgs>,loaderReturn>;

export type HandlerTypes_handlerArgs<eventArgs,loaderReturn> = Internal_genericHandlerArgs<eventLog<eventArgs>,handlerContext,loaderReturn>;

export type HandlerTypes_handler<eventArgs,loaderReturn> = Internal_genericHandler<HandlerTypes_handlerArgs<eventArgs,loaderReturn>>;

export type HandlerTypes_loaderHandler<eventArgs,loaderReturn,eventFilters> = Internal_genericHandlerWithLoader<HandlerTypes_loader<eventArgs,loaderReturn>,HandlerTypes_handler<eventArgs,loaderReturn>,eventFilters>;

export type HandlerTypes_eventConfig<eventFilters> = Internal_eventOptions<eventFilters>;

export type fnWithEventConfig<fn,eventConfig> = $$fnWithEventConfig<fn,eventConfig>;

export type handlerWithOptions<eventArgs,loaderReturn,eventFilters> = fnWithEventConfig<HandlerTypes_handler<eventArgs,loaderReturn>,HandlerTypes_eventConfig<eventFilters>>;

export type contractRegisterWithOptions<eventArgs,eventFilters> = fnWithEventConfig<HandlerTypes_contractRegister<eventArgs>,HandlerTypes_eventConfig<eventFilters>>;

export type IdentityRegistry_chainId = 143;

export type IdentityRegistry_Registered_eventArgs = {
  readonly agentId: bigint; 
  readonly agentURI: string; 
  readonly owner: Address_t
};

export type IdentityRegistry_Registered_block = Block_t;

export type IdentityRegistry_Registered_transaction = Transaction_t;

export type IdentityRegistry_Registered_event = {
  /** The parameters or arguments associated with this event. */
  readonly params: IdentityRegistry_Registered_eventArgs; 
  /** The unique identifier of the blockchain network where this event occurred. */
  readonly chainId: IdentityRegistry_chainId; 
  /** The address of the contract that emitted this event. */
  readonly srcAddress: Address_t; 
  /** The index of this event's log within the block. */
  readonly logIndex: number; 
  /** The transaction that triggered this event. Configurable in `config.yaml` via the `field_selection` option. */
  readonly transaction: IdentityRegistry_Registered_transaction; 
  /** The block in which this event was recorded. Configurable in `config.yaml` via the `field_selection` option. */
  readonly block: IdentityRegistry_Registered_block
};

export type IdentityRegistry_Registered_loaderArgs = Internal_genericLoaderArgs<IdentityRegistry_Registered_event,loaderContext>;

export type IdentityRegistry_Registered_loader<loaderReturn> = Internal_genericLoader<IdentityRegistry_Registered_loaderArgs,loaderReturn>;

export type IdentityRegistry_Registered_handlerArgs<loaderReturn> = Internal_genericHandlerArgs<IdentityRegistry_Registered_event,handlerContext,loaderReturn>;

export type IdentityRegistry_Registered_handler<loaderReturn> = Internal_genericHandler<IdentityRegistry_Registered_handlerArgs<loaderReturn>>;

export type IdentityRegistry_Registered_contractRegister = Internal_genericContractRegister<Internal_genericContractRegisterArgs<IdentityRegistry_Registered_event,contractRegistrations>>;

export type IdentityRegistry_Registered_eventFilter = { readonly agentId?: SingleOrMultiple_t<bigint>; readonly owner?: SingleOrMultiple_t<Address_t> };

export type IdentityRegistry_Registered_eventFiltersArgs = { 
/** The unique identifier of the blockchain network where this event occurred. */
readonly chainId: IdentityRegistry_chainId; 
/** Addresses of the contracts indexing the event. */
readonly addresses: Address_t[] };

export type IdentityRegistry_Registered_eventFiltersDefinition = 
    IdentityRegistry_Registered_eventFilter
  | IdentityRegistry_Registered_eventFilter[];

export type IdentityRegistry_Registered_eventFilters = 
    IdentityRegistry_Registered_eventFilter
  | IdentityRegistry_Registered_eventFilter[]
  | ((_1:IdentityRegistry_Registered_eventFiltersArgs) => IdentityRegistry_Registered_eventFiltersDefinition);

export type ReputationRegistry_chainId = 143;

export type ReputationRegistry_NewFeedback_eventArgs = {
  readonly agentId: bigint; 
  readonly clientAddress: Address_t; 
  readonly feedbackIndex: bigint; 
  readonly value: bigint; 
  readonly valueDecimals: bigint; 
  readonly indexedTag1: string; 
  readonly tag1: string; 
  readonly tag2: string; 
  readonly endpoint: string; 
  readonly feedbackURI: string; 
  readonly feedbackHash: string
};

export type ReputationRegistry_NewFeedback_block = Block_t;

export type ReputationRegistry_NewFeedback_transaction = Transaction_t;

export type ReputationRegistry_NewFeedback_event = {
  /** The parameters or arguments associated with this event. */
  readonly params: ReputationRegistry_NewFeedback_eventArgs; 
  /** The unique identifier of the blockchain network where this event occurred. */
  readonly chainId: ReputationRegistry_chainId; 
  /** The address of the contract that emitted this event. */
  readonly srcAddress: Address_t; 
  /** The index of this event's log within the block. */
  readonly logIndex: number; 
  /** The transaction that triggered this event. Configurable in `config.yaml` via the `field_selection` option. */
  readonly transaction: ReputationRegistry_NewFeedback_transaction; 
  /** The block in which this event was recorded. Configurable in `config.yaml` via the `field_selection` option. */
  readonly block: ReputationRegistry_NewFeedback_block
};

export type ReputationRegistry_NewFeedback_loaderArgs = Internal_genericLoaderArgs<ReputationRegistry_NewFeedback_event,loaderContext>;

export type ReputationRegistry_NewFeedback_loader<loaderReturn> = Internal_genericLoader<ReputationRegistry_NewFeedback_loaderArgs,loaderReturn>;

export type ReputationRegistry_NewFeedback_handlerArgs<loaderReturn> = Internal_genericHandlerArgs<ReputationRegistry_NewFeedback_event,handlerContext,loaderReturn>;

export type ReputationRegistry_NewFeedback_handler<loaderReturn> = Internal_genericHandler<ReputationRegistry_NewFeedback_handlerArgs<loaderReturn>>;

export type ReputationRegistry_NewFeedback_contractRegister = Internal_genericContractRegister<Internal_genericContractRegisterArgs<ReputationRegistry_NewFeedback_event,contractRegistrations>>;

export type ReputationRegistry_NewFeedback_eventFilter = {
  readonly agentId?: SingleOrMultiple_t<bigint>; 
  readonly clientAddress?: SingleOrMultiple_t<Address_t>; 
  readonly indexedTag1?: SingleOrMultiple_t<string>
};

export type ReputationRegistry_NewFeedback_eventFiltersArgs = { 
/** The unique identifier of the blockchain network where this event occurred. */
readonly chainId: ReputationRegistry_chainId; 
/** Addresses of the contracts indexing the event. */
readonly addresses: Address_t[] };

export type ReputationRegistry_NewFeedback_eventFiltersDefinition = 
    ReputationRegistry_NewFeedback_eventFilter
  | ReputationRegistry_NewFeedback_eventFilter[];

export type ReputationRegistry_NewFeedback_eventFilters = 
    ReputationRegistry_NewFeedback_eventFilter
  | ReputationRegistry_NewFeedback_eventFilter[]
  | ((_1:ReputationRegistry_NewFeedback_eventFiltersArgs) => ReputationRegistry_NewFeedback_eventFiltersDefinition);

export type chainId = number;

export type chain = 143;
