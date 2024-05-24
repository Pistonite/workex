/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Result, VoidResult } from "pure/result";

export type WorkexCatch = {
    type: "Catch";
    message: string;
};

export type WorkexInternalError = {
    type: "InternalError";
    message: string;
};

export type WorkexError = WorkexCatch | WorkexInternalError;

export type WorkexResult<T> = Result<T, WorkexError>;
export type WorkexVoid = VoidResult<WorkexError>;
export type WorkexPromise<T> = T extends void ? Promise<WorkexVoid> : Promise<WorkexResult<T>>;

export type WorkerLike = {
    postMessage: (message: any) => any;
    onmessage?: (message: any) => any;
    addEventListener?: (type: string, listener: (event: any) => any) => any;
    terminate?: () => void;
};

export type WorkexCommonOptions = {
    /// The worker to bind to the host
    worker: WorkerLike;

    /// Set to true to use addEventListener instead of onmessage for setting up the worker.
    /// default is false
    useAddEventListener?: boolean;
};

export type WorkexClientOptions = WorkexCommonOptions & {

    /// Timeout for each request in milliseconds.
    /// default or 0 is no timeout
    timeout?: number;

    /// Supply a custom message id generator
    /// useful if the same worker is being shared by multiple clients
    nextMessageId?: () => number;
};

export type WorkexBindOptions = WorkexCommonOptions;
