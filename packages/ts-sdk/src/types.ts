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
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
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

/**
 * A bridge represents an established connection channel.
 * Lands can be opened on the bridge to send and receive messages
 */
type Bridge = {
    openLane: (payload: any) => Lane;
    onLaneOpen: (callback: (payload: any, lane: Lane) => void) => void;
}

type LaneSelection = Record<string, (lane: Lane) => void>;

type Lane = {

}

type End = {
    /** 
     * If the channel this end is connected to is considered secure,
     * which means sensitivity data sent will not be leaked to attacks
     * like Cross-Site Scripting (XSS)
     */
    readonly secure: boolean;
    /** Send message to the other end */
    send: (message: any) => void;
    /** Register handler when recving from the other end */
    onRecv: (callback: (message: any) => void) => void;
}

type ClosableEnd = End & {
    /** Close the channel */
    close: () => void;
    /** Register handler to be invoked when the other end closes the channel */
    onClose: (callback: () => void) => void;
}

/** 
 * Only callable if the global context is a WorkerGlobalScope.
 * Using this scope, an `End` will be created for messaging
 * to the context that created this worker
 */
const linkToWorkerCreator = (): Result<End, Error> => {

}

/**
 * Create an `End` for messaging to the worker
 */
const linkToWorker = (worker: Worker): Result<End, Error> => {
}

type WorkexWorker = {
    // the window or worker that created this worker
    creator: () => Result<End, Error>;

    // create a new worker and link to it
    create: (creator: () => Worker) => Result<End, Error>;
}

type WorkexMainWindow = {
    /**
     * Open a new window and create an end to communicate with that window
     * 
     * In the opened window, connection should be established by calling
     * `linkAsChildWindow().opener()`
     */
    open: (url: string, name?: string, features?: string) => Result<ClosableEnd, Error>;

  
    /**
     * Open a new window and create an end to communicate with that window
     * 
     * In the frame, connection should be established by calling
     * `linkAsChildWindow().opener()`
     */
    linkFrame: (iframe: HTMLIFrameElement) => Result<End, Error>;
}


type WorkexChildWindow = WorkexMainWindow & {
    /** 
     * Get an end that can be used to communicate with opener of this window,
     * (i.e. the window that called `window.open`)
     */
    opener: () => Result<End, Error>;
    /** 
     * Get an end that can be used to communicate with parent of this window
     * (i.e. if this window is an iframe, the parent is the window that contains this iframe)
     */

    parent: () => Result<End, Error>;

}

/**
 * Create and set a global window handler for messaging to the opener
 * and for opening new windows
 * 
 * This should only be called if global context is a Window and should
 * only be called once.
 */
const linkAsMainWindow = (): Result<WorkexMainWindow, Error> => {
}

const linkAsChildWindow = (parentOrigin: string): Result<WorkexChildWindow, Error> => {
}

type MultiEnd = {
    singleEnd: () => Result<End, Error>;
}

type WorkexWindowController<THostSymbol> = {
    opener(): ActiveBus<THostSymbol>;

    openWindow<T>(url: string, name?: string, features?: string): PassiveBus<T>;
}

type WorkexWorkerController = {
    openBus: (proto: string) => ActiveBus<ProtoBase>;
}

type HostOf<THostSymbol> = any

type PassiveBus<TProto extends ProtoBase, TSide extends TProto["TSides"]> = {
    onCalleeOpen: <T extends TProto["THostSymbols"][TSide]>(hostType: T, callback: (host: TProto["Types"][T]) => void) => void;
    onCallerOpen: <T extends TProto["TClient Symbols"][TSide]>(interfaceType: T, callback: () => Promise<HostOf<T>>) => void;
    onClose: (callback: () => void) => void;
    close: () => void;
}

type ActiveBus<THostSymbol> = {
    openCallee: <T extends THostSymbol>(interfaceType: T, host: HostOf<T>) => Promise<void>;
    openCaller: <T extends THostSymbol>(interfaceType: T) => Promise<HostOf<T>>;
    close: () => void;
}

type Lane = {

}

type ProtoBase = {
    TSides: string;
    THostSymbols: {
        [key: string]: string;
    };
    TClientSymbols: {
        [key: string]: string;
    };
    Types: {
        [key: string]: any;
    }
}

type MyProto = {
    TSides: "app" | "ext" | "runtime";
    THostSymbols: {
        "app": "RuntimeApp" | "ExtensionApp";
        "ext": "Extension";
        "runtime": "Runtime";
    },
    TClientSymbols: {
        "app": "Runtime" | "Extension";
        "ext": "ExtensionApp";
        "runtime": "RuntimeApp";
    }
    Types: {
        "RuntimeApp": any;
        "ExtensionApp": any;
        "Extension": any;
        "Runtime": any;
    }
}
