/***** TAKE NOTE ******
This is a hack to get genType to work!

In order for genType to produce recursive types, it needs to be at the 
root module of a file. If it's defined in a nested module it does not 
work. So all the MockDb types and internal functions are defined in TestHelpers_MockDb
and only public functions are recreated and exported from this module.

the following module:
```rescript
module MyModule = {
  @genType
  type rec a = {fieldB: b}
  @genType and b = {fieldA: a}
}
```

produces the following in ts:
```ts
// tslint:disable-next-line:interface-over-type-literal
export type MyModule_a = { readonly fieldB: b };

// tslint:disable-next-line:interface-over-type-literal
export type MyModule_b = { readonly fieldA: MyModule_a };
```

fieldB references type b which doesn't exist because it's defined
as MyModule_b
*/

module MockDb = {
  @genType
  let createMockDb = TestHelpers_MockDb.createMockDb
}

@genType
module Addresses = {
  include TestHelpers_MockAddresses
}

module EventFunctions = {
  //Note these are made into a record to make operate in the same way
  //for Res, JS and TS.

  /**
  The arguements that get passed to a "processEvent" helper function
  */
  @genType
  type eventProcessorArgs<'event> = {
    event: 'event,
    mockDb: TestHelpers_MockDb.t,
    @deprecated("Set the chainId for the event instead")
    chainId?: int,
  }

  @genType
  type eventProcessor<'event> = eventProcessorArgs<'event> => promise<TestHelpers_MockDb.t>

  /**
  A function composer to help create individual processEvent functions
  */
  let makeEventProcessor = (~register) => args => {
    let {event, mockDb, ?chainId} =
      args->(Utils.magic: eventProcessorArgs<'event> => eventProcessorArgs<Internal.event>)

    // Have the line here, just in case the function is called with
    // a manually created event. We don't want to break the existing tests here.
    let _ =
      TestHelpers_MockDb.mockEventRegisters->Utils.WeakMap.set(event, register)
    TestHelpers_MockDb.makeProcessEvents(mockDb, ~chainId=?chainId)([event->(Utils.magic: Internal.event => Types.eventLog<unknown>)])
  }

  module MockBlock = {
    @genType
    type t = {
      @as("hash") hash?: string,
      @as("number") number?: int,
      @as("timestamp") timestamp?: int,
    }

    let toBlock = (_mock: t) => {
      hash: _mock.hash->Belt.Option.getWithDefault("foo"),
      number: _mock.number->Belt.Option.getWithDefault(0),
      timestamp: _mock.timestamp->Belt.Option.getWithDefault(0),
    }->(Utils.magic: Types.AggregatedBlock.t => Internal.eventBlock)
  }

  module MockTransaction = {
    @genType
    type t = {
      @as("hash") hash?: string,
    }

    let toTransaction = (_mock: t) => {
      hash: _mock.hash->Belt.Option.getWithDefault("foo"),
    }->(Utils.magic: Types.AggregatedTransaction.t => Internal.eventTransaction)
  }

  @genType
  type mockEventData = {
    chainId?: int,
    srcAddress?: Address.t,
    logIndex?: int,
    block?: MockBlock.t,
    transaction?: MockTransaction.t,
  }

  /**
  Applies optional paramters with defaults for all common eventLog field
  */
  let makeEventMocker = (
    ~params: Internal.eventParams,
    ~mockEventData: option<mockEventData>,
    ~register: unit => Internal.eventConfig,
  ): Internal.event => {
    let {?block, ?transaction, ?srcAddress, ?chainId, ?logIndex} =
      mockEventData->Belt.Option.getWithDefault({})
    let block = block->Belt.Option.getWithDefault({})->MockBlock.toBlock
    let transaction = transaction->Belt.Option.getWithDefault({})->MockTransaction.toTransaction
    let event: Internal.event = {
      params,
      transaction,
      chainId: switch chainId {
      | Some(chainId) => chainId
      | None =>
        switch Generated.configWithoutRegistrations.defaultChain {
        | Some(chainConfig) => chainConfig.id
        | None =>
          Js.Exn.raiseError(
            "No default chain Id found, please add at least 1 chain to your config.yaml",
          )
        }
      },
      block,
      srcAddress: srcAddress->Belt.Option.getWithDefault(Addresses.defaultAddress),
      logIndex: logIndex->Belt.Option.getWithDefault(0),
    }
    // Since currently it's not possible to figure out the event config from the event
    // we store a reference to the register function by event in a weak map
    let _ = TestHelpers_MockDb.mockEventRegisters->Utils.WeakMap.set(event, register)
    event
  }
}


module IdentityRegistry = {
  module Registered = {
    @genType
    let processEvent: EventFunctions.eventProcessor<Types.IdentityRegistry.Registered.event> = EventFunctions.makeEventProcessor(
      ~register=(Types.IdentityRegistry.Registered.register :> unit => Internal.eventConfig),
    )

    @genType
    type createMockArgs = {
      @as("agentId")
      agentId?: bigint,
      @as("agentURI")
      agentURI?: string,
      @as("owner")
      owner?: Address.t,
      mockEventData?: EventFunctions.mockEventData,
    }

    @genType
    let createMockEvent = args => {
      let {
        ?agentId,
        ?agentURI,
        ?owner,
        ?mockEventData,
      } = args

      let params = 
      {
       agentId: agentId->Belt.Option.getWithDefault(0n),
       agentURI: agentURI->Belt.Option.getWithDefault("foo"),
       owner: owner->Belt.Option.getWithDefault(TestHelpers_MockAddresses.defaultAddress),
      }
->(Utils.magic: Types.IdentityRegistry.Registered.eventArgs => Internal.eventParams)

      EventFunctions.makeEventMocker(
        ~params,
        ~mockEventData,
        ~register=(Types.IdentityRegistry.Registered.register :> unit => Internal.eventConfig),
      )->(Utils.magic: Internal.event => Types.IdentityRegistry.Registered.event)
    }
  }

}


module ReputationRegistry = {
  module NewFeedback = {
    @genType
    let processEvent: EventFunctions.eventProcessor<Types.ReputationRegistry.NewFeedback.event> = EventFunctions.makeEventProcessor(
      ~register=(Types.ReputationRegistry.NewFeedback.register :> unit => Internal.eventConfig),
    )

    @genType
    type createMockArgs = {
      @as("agentId")
      agentId?: bigint,
      @as("clientAddress")
      clientAddress?: Address.t,
      @as("feedbackIndex")
      feedbackIndex?: bigint,
      @as("value")
      value?: bigint,
      @as("valueDecimals")
      valueDecimals?: bigint,
      @as("indexedTag1")
      indexedTag1?: string,
      @as("tag1")
      tag1?: string,
      @as("tag2")
      tag2?: string,
      @as("endpoint")
      endpoint?: string,
      @as("feedbackURI")
      feedbackURI?: string,
      @as("feedbackHash")
      feedbackHash?: string,
      mockEventData?: EventFunctions.mockEventData,
    }

    @genType
    let createMockEvent = args => {
      let {
        ?agentId,
        ?clientAddress,
        ?feedbackIndex,
        ?value,
        ?valueDecimals,
        ?indexedTag1,
        ?tag1,
        ?tag2,
        ?endpoint,
        ?feedbackURI,
        ?feedbackHash,
        ?mockEventData,
      } = args

      let params = 
      {
       agentId: agentId->Belt.Option.getWithDefault(0n),
       clientAddress: clientAddress->Belt.Option.getWithDefault(TestHelpers_MockAddresses.defaultAddress),
       feedbackIndex: feedbackIndex->Belt.Option.getWithDefault(0n),
       value: value->Belt.Option.getWithDefault(0n),
       valueDecimals: valueDecimals->Belt.Option.getWithDefault(0n),
       indexedTag1: indexedTag1->Belt.Option.getWithDefault("foo"),
       tag1: tag1->Belt.Option.getWithDefault("foo"),
       tag2: tag2->Belt.Option.getWithDefault("foo"),
       endpoint: endpoint->Belt.Option.getWithDefault("foo"),
       feedbackURI: feedbackURI->Belt.Option.getWithDefault("foo"),
       feedbackHash: feedbackHash->Belt.Option.getWithDefault("foo"),
      }
->(Utils.magic: Types.ReputationRegistry.NewFeedback.eventArgs => Internal.eventParams)

      EventFunctions.makeEventMocker(
        ~params,
        ~mockEventData,
        ~register=(Types.ReputationRegistry.NewFeedback.register :> unit => Internal.eventConfig),
      )->(Utils.magic: Internal.event => Types.ReputationRegistry.NewFeedback.event)
    }
  }

}

