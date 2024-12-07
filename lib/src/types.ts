/**
 * Types for workex
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Err, Ok, Result, Void, VoidOk } from "@pistonite/pure/result";

/** An error caught by a try-catch */
export type WorkexCatch = {
  type: "Catch";
  message: string;
};

/** A timeout error */
export type WorkexTimeout = {
  type: "Catch";
  message: "Timeout";
};

/** An internal error to workex - likely caused by a bug */
export type WorkexInternalError = {
  type: "Internal";
  message: string;
};

/** Any error that can be returned by workex */
export type WorkexError = WorkexCatch | WorkexInternalError;

/** Result type wrapper */
export type WorkexResult<T> = Result<T, WorkexError>;
/** Void Result type wrapper */
export type WorkexVoid = Void<WorkexError>;
/** Promise type wrapper, mainly to make it easier for codegen to produce types */
export type WorkexPromise<T> = Promise<
  (T extends void ? VoidOk : Ok<T>) | Err<WorkexError>
>;

/** Anything that resembles a worker */
export type WorkerLike = {
  postMessage: (message: any) => any;
  onmessage?: ((message: any) => any) | null;
  addEventListener?: (type: string, listener: (event: any) => any) => any;
  terminate?: (() => void) | null;
};

/** Options for workex */
export type WorkexCommonOptions = {
  /** The worker to bind to the host */
  worker: WorkerLike;

  /**
   * Set to true to assign the handler to onmessage directly
   * instead of calling addEventListener. Note that the worker
   * must have `addEventListener` defined if false. Otherwise
   * it will fallback to assigning to `onmessage`.
   *
   * When you need to send messages in both directions,
   * this must be set to false
   */
  assign?: boolean;
};

/** Options when constructing a client */
export type WorkexClientOptions = WorkexCommonOptions & {
  /**
   * Timeout for each request in milliseconds.
   * default or 0 is no timeout
   */
  timeout?: number;

  /**
   * Supply a custom message id generator
   * useful if the same worker is being shared by multiple clients
   */
  nextMessageId?: () => number;
};

/** Options when binding a host */
export type WorkexBindOptions = WorkexCommonOptions;
