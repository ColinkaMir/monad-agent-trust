/// Whether a rater's payment to the owner was the owner being set up rather than paid: the
/// payment is the owner's first money on Monad and it arrived before the agent was registered.
/// Pure, so the rule can be tested without the index. `firstIn` is the owner's first incoming
/// transfer ({ at, from }), `registeredAt` the agent's registration time, both unix seconds.
export function bootstrappedOwner({ wallet, firstIn, registeredAt }) {
  if (!firstIn || !wallet || registeredAt == null) return false;
  return firstIn.from === wallet.toLowerCase() && firstIn.at <= registeredAt;
}
