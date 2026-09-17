export {
  IdentityRegistry,
  ReputationRegistry,
  onBlock
} from "./src/Handlers.gen";
export type * from "./src/Types.gen";
import {
  IdentityRegistry,
  ReputationRegistry,
  MockDb,
  Addresses
} from "./src/TestHelpers.gen";

export const TestHelpers = {
  IdentityRegistry,
  ReputationRegistry,
  MockDb,
  Addresses
};

export {
} from "./src/Enum.gen";

export {default as BigDecimal} from 'bignumber.js';
