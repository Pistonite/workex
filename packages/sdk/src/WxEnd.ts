import { WxResult, WxVoid} from "./WxError.ts";
import { wxMakeMessageController, WxMessage, WxPayload } from "./WxMessage.ts";
import { once } from "@pistonite/pure/sync";

/** 
 * Messaging primitive representing one end of an established messaging channel
 * 
 * This is an abstraction of the underlying messaging channel, be it
 * a `Worker`, `Window`, or possibly `WebSocket` or HTTP requests in the future.
 * 
 * Workex provides factory functions for creating `WxEnd`s for different messaging channels.
 * Note that since `WxEnd` is an abstraction over an *established* channel, the design pattern
 * is that any valid `WxEnd` objects you create with functions in this library will
 * first establish the handshake.
 */
export type WxEnd = {
    /** Send a message to the other end */
    send: (message: WxMessage) => WxVoid;
    /** Close this end. This may or may not notify the other end about the closing */
    close: () => void;
    /** 
     * Add a subscriber to be called when close() is called, before the end is actually closed
     *
     * Returns a function that can be called to remove the subscriber
     */
    onClose: (callback: () => void) => () => void;
}

export type WxEndRecvFn = (message: WxPayload) => void | Promise<void>;

export type WxEndOptions = {
    /**
     * If specified and non-zero, the creation will fail if the connection
     * is not established within the number of seconds (for example, the worker
     * does not initialize the workex library correctly or an exception happens)
     * 
     * Default is 60 seconds
     */
    timeout?: number;
}

/**
 * Things that looks like a `Worker`
 */
export type WorkerLike = {
    postMessage: (message: any) => any;
    addEventListener: (type: string, listener: (event: any) => any, options?: {signal?: unknown}) => any;
    terminate?: (() => void) | null;
};

/**
 * Create a {@link WxEnd} for messaging to a `Worker` or `WorkerGlobalScope`.
 * 
 * Note that even `Window` objects satisfy the `WorkerLike` interface,
 * they should not be used with this function because messaging between
 * `Window`s and `Worker`s are different.
 * 
 * Please see TODO for more details
 * 
 * @param onRecv callback to register when receiving a message from the other end
 */
export const wxCreateWorkerEnd = async (
    worker: WorkerLike,
    onRecv: WxEndRecvFn,
    options?: WxEndOptions
): Promise<WxResult<WxEnd>> => {
    const controller = wxMakeMessageController(
        false,
        options?.timeout,
        onRecv,
        (handler, signal) => {
            worker.addEventListener("message", handler, { signal });
        },
        (message: WxMessage) => {
            worker.postMessage(message);
        }
    );
    if (controller.err) {
        return controller;
    }

    const { start, close: closeController, isClosed } = controller.val;

    await start();

    const end = wxMakeEnd(
        (message) => worker.postMessage(message),
        () => {
            closeController();
            worker.terminate?.();
        },
        isClosed
    );

    return { val: end };
}

/**
 * Create an `WxEnd` bound to the global `WorkerGlobalScope`.
 * 
 * Calling this when `globalThis` is not a `WorkerGlobalScope` will result in an error.
 * Calling this function multiple times will return the same promise - even if previous
 * call returned an error.
 * 
 * @param onRecv callback to register when receiving a message from the side that created this worker
 */
export const wxWorkerGlobalEnd = once({
    fn: async (onRecv: WxEndRecvFn, option?: WxEndOptions): Promise<WxResult<WxEnd>> => {
        if (!("WorkerGlobalScope" in globalThis) || !(globalThis instanceof (globalThis as any).WorkerGlobalScope)) {
            return {
                err: { code: "NotWorkerGlobalScope" }
            };
        }

        const controller = wxMakeMessageController(
            true,
            option?.timeout,
            onRecv,
            (handler, signal) => {
                // worker global scope can only communicate with the thread
                // that created the worker, so we don't need extra handling
                (globalThis as unknown as WorkerLike).addEventListener("message", handler, { signal });
            },
            (message: WxMessage) => {
                (globalThis as unknown as WorkerLike).postMessage(message);
            }
        );
        if (controller.err) {
            return controller;
        }

        const { start, close, isClosed } = controller.val;

        await start();
        const end = wxMakeEnd(
            (message) => {
                (globalThis as unknown as WorkerLike).postMessage(message);
            },
            close,
            isClosed,
        );
        return { val: end };
    }
})

/**
 * Create a channel with 2 ends that can communicate with each other in the same context.
 * Calling `send` from one end will call the `onRecv` callback of the other end asynchronously.
 * Calling `close` on either end will close the channel immediately (any message sent but not received
 * will also not be received).
 */
export const wxChannel = (onRecvA: WxEndRecvFn, onRecvB: WxEndRecvFn): [WxEnd, WxEnd] => {
    let isClosed = false;
    const sendFromA = (message: WxMessage) => {
        if (isClosed) {
            return { err: { code: "Closed" as const } };
        }
        setTimeout(() => {
            if (isClosed) {
                return;
            }
            onRecvB(message)
        }, 0);
        return {};
    };
    const sendFromB = (message: WxMessage) => {
        if (isClosed) {
            return { err: { code: "Closed" as const } };
        }
        setTimeout(() => {
            if (isClosed) {
                return;
            }
            onRecvA(message)
        }, 0);
        return {};
    };
    const subscribers: (() => void)[] = [];
        const onClose =  (callback: () => void) => {
            subscribers.push(callback);
            return () => {
                const index = subscribers.indexOf(callback);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
            }
        };
    const notifyClose = () => {
            for (const subscriber of subscribers) {
                subscriber();
            }
    };
    const close = () => {
        notifyClose();
        isClosed = true;
    };
    return [
        { send: sendFromA, close, onClose },
        { send: sendFromB, close, onClose }
    ];
}

export const wxMakeEnd = (
    send: (message: WxMessage) => void,
    close: () => void,
    isClosed: () => boolean
): WxEnd => {
    const subscribers: (() => void)[] = [];
        const onClose =  (callback: () => void) => {
            subscribers.push(callback);
            return () => {
                const index = subscribers.indexOf(callback);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
            }
        };
    const notifyClose = () => {
            for (const subscriber of subscribers) {
                subscriber();
            }
    };
    return {
        send: (message) => {
            if (isClosed()) {
                return { err: { code: "Closed" } };
            }
            send(message);
            return {};
        },
        close: () => {
            notifyClose();
            close();
        }
        , onClose
    }
}
