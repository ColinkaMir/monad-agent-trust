module ContractType = {
  @genType
  type t = 
    | @as("IdentityRegistry") IdentityRegistry
    | @as("ReputationRegistry") ReputationRegistry

  let name = "CONTRACT_TYPE"
  let variants = [
    IdentityRegistry,
    ReputationRegistry,
  ]
  let config = Internal.makeEnumConfig(~name, ~variants)
}

module EntityType = {
  @genType
  type t = 
    | @as("Agent") Agent
    | @as("AgentRater") AgentRater
    | @as("Feedback") Feedback
    | @as("Rater") Rater
    | @as("dynamic_contract_registry") DynamicContractRegistry

  let name = "ENTITY_TYPE"
  let variants = [
    Agent,
    AgentRater,
    Feedback,
    Rater,
    DynamicContractRegistry,
  ]
  let config = Internal.makeEnumConfig(~name, ~variants)
}

let allEnums = ([
  ContractType.config->Internal.fromGenericEnumConfig,
  EntityType.config->Internal.fromGenericEnumConfig,
])
