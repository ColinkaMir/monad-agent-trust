/* TypeScript file generated from Handlers.res by genType. */

/* eslint-disable */
/* tslint:disable */

const HandlersJS = require('./Handlers.res.js');

import type {HandlerTypes_eventConfig as Types_HandlerTypes_eventConfig} from './Types.gen';

import type {IdentityRegistry_Registered_eventFilters as Types_IdentityRegistry_Registered_eventFilters} from './Types.gen';

import type {IdentityRegistry_Registered_event as Types_IdentityRegistry_Registered_event} from './Types.gen';

import type {ReputationRegistry_NewFeedback_eventFilters as Types_ReputationRegistry_NewFeedback_eventFilters} from './Types.gen';

import type {ReputationRegistry_NewFeedback_event as Types_ReputationRegistry_NewFeedback_event} from './Types.gen';

import type {chain as Types_chain} from './Types.gen';

import type {contractRegistrations as Types_contractRegistrations} from './Types.gen';

import type {fnWithEventConfig as Types_fnWithEventConfig} from './Types.gen';

import type {genericContractRegisterArgs as Internal_genericContractRegisterArgs} from 'envio/src/Internal.gen';

import type {genericContractRegister as Internal_genericContractRegister} from 'envio/src/Internal.gen';

import type {genericHandlerArgs as Internal_genericHandlerArgs} from 'envio/src/Internal.gen';

import type {genericHandlerWithLoader as Internal_genericHandlerWithLoader} from 'envio/src/Internal.gen';

import type {genericHandler as Internal_genericHandler} from 'envio/src/Internal.gen';

import type {genericLoaderArgs as Internal_genericLoaderArgs} from 'envio/src/Internal.gen';

import type {genericLoader as Internal_genericLoader} from 'envio/src/Internal.gen';

import type {handlerContext as Types_handlerContext} from './Types.gen';

import type {loaderContext as Types_loaderContext} from './Types.gen';

import type {onBlockArgs as Envio_onBlockArgs} from 'envio/src/Envio.gen';

import type {onBlockOptions as Envio_onBlockOptions} from 'envio/src/Envio.gen';

export const IdentityRegistry_Registered_contractRegister: Types_fnWithEventConfig<Internal_genericContractRegister<Internal_genericContractRegisterArgs<Types_IdentityRegistry_Registered_event,Types_contractRegistrations>>,Types_HandlerTypes_eventConfig<Types_IdentityRegistry_Registered_eventFilters>> = HandlersJS.IdentityRegistry.Registered.contractRegister as any;

export const IdentityRegistry_Registered_handler: Types_fnWithEventConfig<Internal_genericHandler<Internal_genericHandlerArgs<Types_IdentityRegistry_Registered_event,Types_handlerContext,void>>,Types_HandlerTypes_eventConfig<Types_IdentityRegistry_Registered_eventFilters>> = HandlersJS.IdentityRegistry.Registered.handler as any;

export const IdentityRegistry_Registered_handlerWithLoader: <loaderReturn>(_1:Internal_genericHandlerWithLoader<Internal_genericLoader<Internal_genericLoaderArgs<Types_IdentityRegistry_Registered_event,Types_loaderContext>,loaderReturn>,Internal_genericHandler<Internal_genericHandlerArgs<Types_IdentityRegistry_Registered_event,Types_handlerContext,loaderReturn>>,Types_IdentityRegistry_Registered_eventFilters>) => void = HandlersJS.IdentityRegistry.Registered.handlerWithLoader as any;

export const ReputationRegistry_NewFeedback_contractRegister: Types_fnWithEventConfig<Internal_genericContractRegister<Internal_genericContractRegisterArgs<Types_ReputationRegistry_NewFeedback_event,Types_contractRegistrations>>,Types_HandlerTypes_eventConfig<Types_ReputationRegistry_NewFeedback_eventFilters>> = HandlersJS.ReputationRegistry.NewFeedback.contractRegister as any;

export const ReputationRegistry_NewFeedback_handler: Types_fnWithEventConfig<Internal_genericHandler<Internal_genericHandlerArgs<Types_ReputationRegistry_NewFeedback_event,Types_handlerContext,void>>,Types_HandlerTypes_eventConfig<Types_ReputationRegistry_NewFeedback_eventFilters>> = HandlersJS.ReputationRegistry.NewFeedback.handler as any;

export const ReputationRegistry_NewFeedback_handlerWithLoader: <loaderReturn>(_1:Internal_genericHandlerWithLoader<Internal_genericLoader<Internal_genericLoaderArgs<Types_ReputationRegistry_NewFeedback_event,Types_loaderContext>,loaderReturn>,Internal_genericHandler<Internal_genericHandlerArgs<Types_ReputationRegistry_NewFeedback_event,Types_handlerContext,loaderReturn>>,Types_ReputationRegistry_NewFeedback_eventFilters>) => void = HandlersJS.ReputationRegistry.NewFeedback.handlerWithLoader as any;

/** Register a Block Handler. It'll be called for every block by default. */
export const onBlock: (_1:Envio_onBlockOptions<Types_chain>, _2:((_1:Envio_onBlockArgs<Types_handlerContext>) => Promise<void>)) => void = HandlersJS.onBlock as any;

export const IdentityRegistry: { Registered: {
  handlerWithLoader: <loaderReturn>(_1:Internal_genericHandlerWithLoader<Internal_genericLoader<Internal_genericLoaderArgs<Types_IdentityRegistry_Registered_event,Types_loaderContext>,loaderReturn>,Internal_genericHandler<Internal_genericHandlerArgs<Types_IdentityRegistry_Registered_event,Types_handlerContext,loaderReturn>>,Types_IdentityRegistry_Registered_eventFilters>) => void; 
  handler: Types_fnWithEventConfig<Internal_genericHandler<Internal_genericHandlerArgs<Types_IdentityRegistry_Registered_event,Types_handlerContext,void>>,Types_HandlerTypes_eventConfig<Types_IdentityRegistry_Registered_eventFilters>>; 
  contractRegister: Types_fnWithEventConfig<Internal_genericContractRegister<Internal_genericContractRegisterArgs<Types_IdentityRegistry_Registered_event,Types_contractRegistrations>>,Types_HandlerTypes_eventConfig<Types_IdentityRegistry_Registered_eventFilters>>
} } = HandlersJS.IdentityRegistry as any;

export const ReputationRegistry: { NewFeedback: {
  handlerWithLoader: <loaderReturn>(_1:Internal_genericHandlerWithLoader<Internal_genericLoader<Internal_genericLoaderArgs<Types_ReputationRegistry_NewFeedback_event,Types_loaderContext>,loaderReturn>,Internal_genericHandler<Internal_genericHandlerArgs<Types_ReputationRegistry_NewFeedback_event,Types_handlerContext,loaderReturn>>,Types_ReputationRegistry_NewFeedback_eventFilters>) => void; 
  handler: Types_fnWithEventConfig<Internal_genericHandler<Internal_genericHandlerArgs<Types_ReputationRegistry_NewFeedback_event,Types_handlerContext,void>>,Types_HandlerTypes_eventConfig<Types_ReputationRegistry_NewFeedback_eventFilters>>; 
  contractRegister: Types_fnWithEventConfig<Internal_genericContractRegister<Internal_genericContractRegisterArgs<Types_ReputationRegistry_NewFeedback_event,Types_contractRegistrations>>,Types_HandlerTypes_eventConfig<Types_ReputationRegistry_NewFeedback_eventFilters>>
} } = HandlersJS.ReputationRegistry as any;
