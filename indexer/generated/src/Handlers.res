  @genType
module IdentityRegistry = {
  module Registered = Types.MakeRegister(Types.IdentityRegistry.Registered)
}

  @genType
module ReputationRegistry = {
  module NewFeedback = Types.MakeRegister(Types.ReputationRegistry.NewFeedback)
}

@genType /** Register a Block Handler. It'll be called for every block by default. */
let onBlock: (
  Envio.onBlockOptions<Types.chain>,
  Envio.onBlockArgs<Types.handlerContext> => promise<unit>,
) => unit = (
  EventRegister.onBlock: (unknown, Internal.onBlockArgs => promise<unit>) => unit
)->Utils.magic
