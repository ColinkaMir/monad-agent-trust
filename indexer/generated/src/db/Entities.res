open Table
open Enums.EntityType
type id = string

type internalEntity = Internal.entity
module type Entity = {
  type t
  let index: int
  let name: string
  let schema: S.t<t>
  let rowsSchema: S.t<array<t>>
  let table: Table.table
  let entityHistory: EntityHistory.t<t>
}
external entityModToInternal: module(Entity with type t = 'a) => Internal.entityConfig = "%identity"
external entityModsToInternal: array<module(Entity)> => array<Internal.entityConfig> = "%identity"
external entitiesToInternal: array<'a> => array<Internal.entity> = "%identity"

@get
external getEntityId: internalEntity => string = "id"

// Use InMemoryTable.Entity.getEntityIdUnsafe instead of duplicating the logic
let getEntityIdUnsafe = InMemoryTable.Entity.getEntityIdUnsafe

//shorthand for punning
let isPrimaryKey = true
let isNullable = true
let isArray = true
let isIndex = true

@genType
type whereOperations<'entity, 'fieldType> = {
  eq: 'fieldType => promise<array<'entity>>,
  gt: 'fieldType => promise<array<'entity>>,
  lt: 'fieldType => promise<array<'entity>>
}

module Agent = {
  let name = (Agent :> string)
  let index = 0
  @genType
  type t = {
    agentURI: string,
    feedbackCount: int,
    id: id,
    owner: string,
    raterCount: int,
    registeredAt: bigint,
    registeredBlock: bigint,
    scoreSum: bigint,
  }

  let schema = S.object((s): t => {
    agentURI: s.field("agentURI", S.string),
    feedbackCount: s.field("feedbackCount", S.int),
    id: s.field("id", S.string),
    owner: s.field("owner", S.string),
    raterCount: s.field("raterCount", S.int),
    registeredAt: s.field("registeredAt", BigInt.schema),
    registeredBlock: s.field("registeredBlock", BigInt.schema),
    scoreSum: s.field("scoreSum", BigInt.schema),
  })

  let rowsSchema = S.array(schema)

  @genType
  type indexedFieldOperations = {
    
  }

  let table = mkTable(
    (name :> string),
    ~fields=[
      mkField(
      "agentURI", 
      Text,
      ~fieldSchema=S.string,
      
      
      
      
      
      ),
      mkField(
      "feedbackCount", 
      Integer,
      ~fieldSchema=S.int,
      
      
      
      
      
      ),
      mkField(
      "id", 
      Text,
      ~fieldSchema=S.string,
      ~isPrimaryKey,
      
      
      
      
      ),
      mkField(
      "owner", 
      Text,
      ~fieldSchema=S.string,
      
      
      
      
      
      ),
      mkField(
      "raterCount", 
      Integer,
      ~fieldSchema=S.int,
      
      
      
      
      
      ),
      mkField(
      "registeredAt", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "registeredBlock", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "scoreSum", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
    ],
  )

  let entityHistory = table->EntityHistory.fromTable(~schema, ~entityIndex=index)

  external castToInternal: t => Internal.entity = "%identity"
}

module AgentRater = {
  let name = (AgentRater :> string)
  let index = 1
  @genType
  type t = {
    agent_id: id,
    client: string,
    firstAt: bigint,
    id: id,
    ratings: int,
  }

  let schema = S.object((s): t => {
    agent_id: s.field("agent_id", S.string),
    client: s.field("client", S.string),
    firstAt: s.field("firstAt", BigInt.schema),
    id: s.field("id", S.string),
    ratings: s.field("ratings", S.int),
  })

  let rowsSchema = S.array(schema)

  @genType
  type indexedFieldOperations = {
    
  }

  let table = mkTable(
    (name :> string),
    ~fields=[
      mkField(
      "agent", 
      Text,
      ~fieldSchema=S.string,
      
      
      
      
      ~linkedEntity="Agent",
      ),
      mkField(
      "client", 
      Text,
      ~fieldSchema=S.string,
      
      
      
      
      
      ),
      mkField(
      "firstAt", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "id", 
      Text,
      ~fieldSchema=S.string,
      ~isPrimaryKey,
      
      
      
      
      ),
      mkField(
      "ratings", 
      Integer,
      ~fieldSchema=S.int,
      
      
      
      
      
      ),
    ],
  )

  let entityHistory = table->EntityHistory.fromTable(~schema, ~entityIndex=index)

  external castToInternal: t => Internal.entity = "%identity"
}

module Feedback = {
  let name = (Feedback :> string)
  let index = 2
  @genType
  type t = {
    agent_id: id,
    block: bigint,
    client: string,
    endpoint: string,
    id: id,
    tag1: string,
    timestamp: bigint,
    value: bigint,
    valueDecimals: int,
  }

  let schema = S.object((s): t => {
    agent_id: s.field("agent_id", S.string),
    block: s.field("block", BigInt.schema),
    client: s.field("client", S.string),
    endpoint: s.field("endpoint", S.string),
    id: s.field("id", S.string),
    tag1: s.field("tag1", S.string),
    timestamp: s.field("timestamp", BigInt.schema),
    value: s.field("value", BigInt.schema),
    valueDecimals: s.field("valueDecimals", S.int),
  })

  let rowsSchema = S.array(schema)

  @genType
  type indexedFieldOperations = {
    
  }

  let table = mkTable(
    (name :> string),
    ~fields=[
      mkField(
      "agent", 
      Text,
      ~fieldSchema=S.string,
      
      
      
      
      ~linkedEntity="Agent",
      ),
      mkField(
      "block", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "client", 
      Text,
      ~fieldSchema=S.string,
      
      
      
      
      
      ),
      mkField(
      "endpoint", 
      Text,
      ~fieldSchema=S.string,
      
      
      
      
      
      ),
      mkField(
      "id", 
      Text,
      ~fieldSchema=S.string,
      ~isPrimaryKey,
      
      
      
      
      ),
      mkField(
      "tag1", 
      Text,
      ~fieldSchema=S.string,
      
      
      
      
      
      ),
      mkField(
      "timestamp", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "value", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "valueDecimals", 
      Integer,
      ~fieldSchema=S.int,
      
      
      
      
      
      ),
    ],
  )

  let entityHistory = table->EntityHistory.fromTable(~schema, ~entityIndex=index)

  external castToInternal: t => Internal.entity = "%identity"
}

module Rater = {
  let name = (Rater :> string)
  let index = 3
  @genType
  type t = {
    agentsRated: int,
    firstRatedAt: bigint,
    id: id,
    lastRatedAt: bigint,
    ratingsGiven: int,
  }

  let schema = S.object((s): t => {
    agentsRated: s.field("agentsRated", S.int),
    firstRatedAt: s.field("firstRatedAt", BigInt.schema),
    id: s.field("id", S.string),
    lastRatedAt: s.field("lastRatedAt", BigInt.schema),
    ratingsGiven: s.field("ratingsGiven", S.int),
  })

  let rowsSchema = S.array(schema)

  @genType
  type indexedFieldOperations = {
    
  }

  let table = mkTable(
    (name :> string),
    ~fields=[
      mkField(
      "agentsRated", 
      Integer,
      ~fieldSchema=S.int,
      
      
      
      
      
      ),
      mkField(
      "firstRatedAt", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "id", 
      Text,
      ~fieldSchema=S.string,
      ~isPrimaryKey,
      
      
      
      
      ),
      mkField(
      "lastRatedAt", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "ratingsGiven", 
      Integer,
      ~fieldSchema=S.int,
      
      
      
      
      
      ),
    ],
  )

  let entityHistory = table->EntityHistory.fromTable(~schema, ~entityIndex=index)

  external castToInternal: t => Internal.entity = "%identity"
}

let userEntities = [
  module(Agent),
  module(AgentRater),
  module(Feedback),
  module(Rater),
]->entityModsToInternal

let allEntities =
  userEntities->Js.Array2.concat(
    [module(InternalTable.DynamicContractRegistry)]->entityModsToInternal,
  )

let byName =
  allEntities
  ->Js.Array2.map(entityConfig => {
    (entityConfig.name, entityConfig)
  })
  ->Js.Dict.fromArray
