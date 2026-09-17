// This file is to dynamically generate TS types
// which we can't get using GenType
// Use @genType.import to link the types back to ReScript code

import type { Logger, EffectCaller } from "envio";
import type * as Entities from "./db/Entities.gen.ts";

export type LoaderContext = {
  /**
   * Access the logger instance with event as a context. The logs will be displayed in the console and Envio Hosted Service.
   */
  readonly log: Logger;
  /**
   * Call the provided Effect with the given input.
   * Effects are the best for external calls with automatic deduplication, error handling and caching.
   * Define a new Effect using createEffect outside of the handler.
   */
  readonly effect: EffectCaller;
  /**
   * True when the handlers run in preload mode - in parallel for the whole batch.
   * Handlers run twice per batch of events, and the first time is the "preload" run
   * During preload entities aren't set, logs are ignored and exceptions are silently swallowed.
   * Preload mode is the best time to populate data to in-memory cache.
   * After preload the handler will run for the second time in sequential order of events.
   */
  readonly isPreload: boolean;
  /**
   * Per-chain state information accessible in event handlers and block handlers.
   * Each chain ID maps to an object containing chain-specific state:
   * - isReady: true when the chain has completed initial sync and is processing live events,
   *            false during historical synchronization
   */
  readonly chains: {
    [chainId: string]: {
      readonly isReady: boolean;
    };
  };
  readonly Agent: {
    /**
     * Load the entity Agent from the storage by ID.
     * If the entity is not found, returns undefined.
     */
    readonly get: (id: string) => Promise<Entities.Agent_t | undefined>,
    /**
     * Load the entity Agent from the storage by ID.
     * If the entity is not found, throws an error.
     */
    readonly getOrThrow: (id: string, message?: string) => Promise<Entities.Agent_t>,
    readonly getWhere: Entities.Agent_indexedFieldOperations,
    /**
     * Returns the entity Agent from the storage by ID.
     * If the entity is not found, creates it using provided parameters and returns it.
     */
    readonly getOrCreate: (entity: Entities.Agent_t) => Promise<Entities.Agent_t>,
    /**
     * Set the entity Agent in the storage.
     */
    readonly set: (entity: Entities.Agent_t) => void,
    /**
     * Delete the entity Agent from the storage.
     *
     * The 'deleteUnsafe' method is experimental and unsafe. You should manually handle all entity references after deletion to maintain database consistency.
     */
    readonly deleteUnsafe: (id: string) => void,
  }
  readonly AgentRater: {
    /**
     * Load the entity AgentRater from the storage by ID.
     * If the entity is not found, returns undefined.
     */
    readonly get: (id: string) => Promise<Entities.AgentRater_t | undefined>,
    /**
     * Load the entity AgentRater from the storage by ID.
     * If the entity is not found, throws an error.
     */
    readonly getOrThrow: (id: string, message?: string) => Promise<Entities.AgentRater_t>,
    readonly getWhere: Entities.AgentRater_indexedFieldOperations,
    /**
     * Returns the entity AgentRater from the storage by ID.
     * If the entity is not found, creates it using provided parameters and returns it.
     */
    readonly getOrCreate: (entity: Entities.AgentRater_t) => Promise<Entities.AgentRater_t>,
    /**
     * Set the entity AgentRater in the storage.
     */
    readonly set: (entity: Entities.AgentRater_t) => void,
    /**
     * Delete the entity AgentRater from the storage.
     *
     * The 'deleteUnsafe' method is experimental and unsafe. You should manually handle all entity references after deletion to maintain database consistency.
     */
    readonly deleteUnsafe: (id: string) => void,
  }
  readonly Feedback: {
    /**
     * Load the entity Feedback from the storage by ID.
     * If the entity is not found, returns undefined.
     */
    readonly get: (id: string) => Promise<Entities.Feedback_t | undefined>,
    /**
     * Load the entity Feedback from the storage by ID.
     * If the entity is not found, throws an error.
     */
    readonly getOrThrow: (id: string, message?: string) => Promise<Entities.Feedback_t>,
    readonly getWhere: Entities.Feedback_indexedFieldOperations,
    /**
     * Returns the entity Feedback from the storage by ID.
     * If the entity is not found, creates it using provided parameters and returns it.
     */
    readonly getOrCreate: (entity: Entities.Feedback_t) => Promise<Entities.Feedback_t>,
    /**
     * Set the entity Feedback in the storage.
     */
    readonly set: (entity: Entities.Feedback_t) => void,
    /**
     * Delete the entity Feedback from the storage.
     *
     * The 'deleteUnsafe' method is experimental and unsafe. You should manually handle all entity references after deletion to maintain database consistency.
     */
    readonly deleteUnsafe: (id: string) => void,
  }
  readonly Rater: {
    /**
     * Load the entity Rater from the storage by ID.
     * If the entity is not found, returns undefined.
     */
    readonly get: (id: string) => Promise<Entities.Rater_t | undefined>,
    /**
     * Load the entity Rater from the storage by ID.
     * If the entity is not found, throws an error.
     */
    readonly getOrThrow: (id: string, message?: string) => Promise<Entities.Rater_t>,
    readonly getWhere: Entities.Rater_indexedFieldOperations,
    /**
     * Returns the entity Rater from the storage by ID.
     * If the entity is not found, creates it using provided parameters and returns it.
     */
    readonly getOrCreate: (entity: Entities.Rater_t) => Promise<Entities.Rater_t>,
    /**
     * Set the entity Rater in the storage.
     */
    readonly set: (entity: Entities.Rater_t) => void,
    /**
     * Delete the entity Rater from the storage.
     *
     * The 'deleteUnsafe' method is experimental and unsafe. You should manually handle all entity references after deletion to maintain database consistency.
     */
    readonly deleteUnsafe: (id: string) => void,
  }
};

export type HandlerContext = {
  /**
   * Access the logger instance with event as a context. The logs will be displayed in the console and Envio Hosted Service.
   */
  readonly log: Logger;
  /**
   * Call the provided Effect with the given input.
   * Effects are the best for external calls with automatic deduplication, error handling and caching.
   * Define a new Effect using createEffect outside of the handler.
   */
  readonly effect: EffectCaller;
  /**
   * Per-chain state information accessible in event handlers and block handlers.
   * Each chain ID maps to an object containing chain-specific state:
   * - isReady: true when the chain has completed initial sync and is processing live events,
   *            false during historical synchronization
   */
  readonly chains: {
    [chainId: string]: {
      readonly isReady: boolean;
    };
  };
  readonly Agent: {
    /**
     * Load the entity Agent from the storage by ID.
     * If the entity is not found, returns undefined.
     */
    readonly get: (id: string) => Promise<Entities.Agent_t | undefined>,
    /**
     * Load the entity Agent from the storage by ID.
     * If the entity is not found, throws an error.
     */
    readonly getOrThrow: (id: string, message?: string) => Promise<Entities.Agent_t>,
    /**
     * Returns the entity Agent from the storage by ID.
     * If the entity is not found, creates it using provided parameters and returns it.
     */
    readonly getOrCreate: (entity: Entities.Agent_t) => Promise<Entities.Agent_t>,
    /**
     * Set the entity Agent in the storage.
     */
    readonly set: (entity: Entities.Agent_t) => void,
    /**
     * Delete the entity Agent from the storage.
     *
     * The 'deleteUnsafe' method is experimental and unsafe. You should manually handle all entity references after deletion to maintain database consistency.
     */
    readonly deleteUnsafe: (id: string) => void,
  }
  readonly AgentRater: {
    /**
     * Load the entity AgentRater from the storage by ID.
     * If the entity is not found, returns undefined.
     */
    readonly get: (id: string) => Promise<Entities.AgentRater_t | undefined>,
    /**
     * Load the entity AgentRater from the storage by ID.
     * If the entity is not found, throws an error.
     */
    readonly getOrThrow: (id: string, message?: string) => Promise<Entities.AgentRater_t>,
    /**
     * Returns the entity AgentRater from the storage by ID.
     * If the entity is not found, creates it using provided parameters and returns it.
     */
    readonly getOrCreate: (entity: Entities.AgentRater_t) => Promise<Entities.AgentRater_t>,
    /**
     * Set the entity AgentRater in the storage.
     */
    readonly set: (entity: Entities.AgentRater_t) => void,
    /**
     * Delete the entity AgentRater from the storage.
     *
     * The 'deleteUnsafe' method is experimental and unsafe. You should manually handle all entity references after deletion to maintain database consistency.
     */
    readonly deleteUnsafe: (id: string) => void,
  }
  readonly Feedback: {
    /**
     * Load the entity Feedback from the storage by ID.
     * If the entity is not found, returns undefined.
     */
    readonly get: (id: string) => Promise<Entities.Feedback_t | undefined>,
    /**
     * Load the entity Feedback from the storage by ID.
     * If the entity is not found, throws an error.
     */
    readonly getOrThrow: (id: string, message?: string) => Promise<Entities.Feedback_t>,
    /**
     * Returns the entity Feedback from the storage by ID.
     * If the entity is not found, creates it using provided parameters and returns it.
     */
    readonly getOrCreate: (entity: Entities.Feedback_t) => Promise<Entities.Feedback_t>,
    /**
     * Set the entity Feedback in the storage.
     */
    readonly set: (entity: Entities.Feedback_t) => void,
    /**
     * Delete the entity Feedback from the storage.
     *
     * The 'deleteUnsafe' method is experimental and unsafe. You should manually handle all entity references after deletion to maintain database consistency.
     */
    readonly deleteUnsafe: (id: string) => void,
  }
  readonly Rater: {
    /**
     * Load the entity Rater from the storage by ID.
     * If the entity is not found, returns undefined.
     */
    readonly get: (id: string) => Promise<Entities.Rater_t | undefined>,
    /**
     * Load the entity Rater from the storage by ID.
     * If the entity is not found, throws an error.
     */
    readonly getOrThrow: (id: string, message?: string) => Promise<Entities.Rater_t>,
    /**
     * Returns the entity Rater from the storage by ID.
     * If the entity is not found, creates it using provided parameters and returns it.
     */
    readonly getOrCreate: (entity: Entities.Rater_t) => Promise<Entities.Rater_t>,
    /**
     * Set the entity Rater in the storage.
     */
    readonly set: (entity: Entities.Rater_t) => void,
    /**
     * Delete the entity Rater from the storage.
     *
     * The 'deleteUnsafe' method is experimental and unsafe. You should manually handle all entity references after deletion to maintain database consistency.
     */
    readonly deleteUnsafe: (id: string) => void,
  }
};
