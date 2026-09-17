/* TypeScript file generated from TestHelpers.res by genType. */

/* eslint-disable */
/* tslint:disable */

const TestHelpersJS = require('./TestHelpers.res.js');

import type {IdentityRegistry_Registered_event as Types_IdentityRegistry_Registered_event} from './Types.gen';

import type {ReputationRegistry_NewFeedback_event as Types_ReputationRegistry_NewFeedback_event} from './Types.gen';

import type {t as Address_t} from 'envio/src/Address.gen';

import type {t as TestHelpers_MockDb_t} from './TestHelpers_MockDb.gen';

/** The arguements that get passed to a "processEvent" helper function */
export type EventFunctions_eventProcessorArgs<event> = {
  readonly event: event; 
  readonly mockDb: TestHelpers_MockDb_t; 
  readonly chainId?: number
};

export type EventFunctions_eventProcessor<event> = (_1:EventFunctions_eventProcessorArgs<event>) => Promise<TestHelpers_MockDb_t>;

export type EventFunctions_MockBlock_t = {
  readonly hash?: string; 
  readonly number?: number; 
  readonly timestamp?: number
};

export type EventFunctions_MockTransaction_t = { readonly hash?: string };

export type EventFunctions_mockEventData = {
  readonly chainId?: number; 
  readonly srcAddress?: Address_t; 
  readonly logIndex?: number; 
  readonly block?: EventFunctions_MockBlock_t; 
  readonly transaction?: EventFunctions_MockTransaction_t
};

export type IdentityRegistry_Registered_createMockArgs = {
  readonly agentId?: bigint; 
  readonly agentURI?: string; 
  readonly owner?: Address_t; 
  readonly mockEventData?: EventFunctions_mockEventData
};

export type ReputationRegistry_NewFeedback_createMockArgs = {
  readonly agentId?: bigint; 
  readonly clientAddress?: Address_t; 
  readonly feedbackIndex?: bigint; 
  readonly value?: bigint; 
  readonly valueDecimals?: bigint; 
  readonly indexedTag1?: string; 
  readonly tag1?: string; 
  readonly tag2?: string; 
  readonly endpoint?: string; 
  readonly feedbackURI?: string; 
  readonly feedbackHash?: string; 
  readonly mockEventData?: EventFunctions_mockEventData
};

export const MockDb_createMockDb: () => TestHelpers_MockDb_t = TestHelpersJS.MockDb.createMockDb as any;

export const Addresses_mockAddresses: Address_t[] = TestHelpersJS.Addresses.mockAddresses as any;

export const Addresses_defaultAddress: Address_t = TestHelpersJS.Addresses.defaultAddress as any;

export const IdentityRegistry_Registered_processEvent: EventFunctions_eventProcessor<Types_IdentityRegistry_Registered_event> = TestHelpersJS.IdentityRegistry.Registered.processEvent as any;

export const IdentityRegistry_Registered_createMockEvent: (args:IdentityRegistry_Registered_createMockArgs) => Types_IdentityRegistry_Registered_event = TestHelpersJS.IdentityRegistry.Registered.createMockEvent as any;

export const ReputationRegistry_NewFeedback_processEvent: EventFunctions_eventProcessor<Types_ReputationRegistry_NewFeedback_event> = TestHelpersJS.ReputationRegistry.NewFeedback.processEvent as any;

export const ReputationRegistry_NewFeedback_createMockEvent: (args:ReputationRegistry_NewFeedback_createMockArgs) => Types_ReputationRegistry_NewFeedback_event = TestHelpersJS.ReputationRegistry.NewFeedback.createMockEvent as any;

export const Addresses: { mockAddresses: Address_t[]; defaultAddress: Address_t } = TestHelpersJS.Addresses as any;

export const IdentityRegistry: { Registered: { processEvent: EventFunctions_eventProcessor<Types_IdentityRegistry_Registered_event>; createMockEvent: (args:IdentityRegistry_Registered_createMockArgs) => Types_IdentityRegistry_Registered_event } } = TestHelpersJS.IdentityRegistry as any;

export const ReputationRegistry: { NewFeedback: { processEvent: EventFunctions_eventProcessor<Types_ReputationRegistry_NewFeedback_event>; createMockEvent: (args:ReputationRegistry_NewFeedback_createMockArgs) => Types_ReputationRegistry_NewFeedback_event } } = TestHelpersJS.ReputationRegistry as any;

export const MockDb: { createMockDb: () => TestHelpers_MockDb_t } = TestHelpersJS.MockDb as any;
