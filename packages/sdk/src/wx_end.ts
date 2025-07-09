import { once } from "@pistonite/pure/sync";

import type { WxResult, WxVoid } from "./wx_error.ts";
import {
    wxFuncClose,
    wxInternalProtocol,
    wxMakeCloseController,
    wxMakeMessageController,
    type WxCloseController,
    type WxMessage,
    type WxOnRecvFn,
} from "./wx_message.ts";

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
export type WxEnd = WxCloseController & {
    /** Send a message to the other end */
    send: (message: WxMessage) => WxVoid;
};

export type WxEndOptions = {
    /**
     * If specified and non-zero, the creation will fail if the connection
     * is not established within the number of seconds (for example, the worker
     * does not initialize the workex library correctly or an exception happens)
     *
     * Default is 60 seconds
     */
    timeout?: number;
};

/**
 * Things that looks like a `Worker`
 */
export type WorkerLike = {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    postMessage: (message: any) => any;
    addEventListener: (
        type: string,
        listener: (event: any) => any,
        options?: { signal?: any },
    ) => any;
    terminate?: (() => void) | null;
    /* eslint-enable @typescript-eslint/no-explicit-any */
};

/**
 * Create a {@link WxEnd} for messaging to a `Worker` or `WorkerGlobalScope`.
 *
 * Note that even `Window` objects satisfy the `WorkerLike` interface,
 * they should not be used with this function because messaging between
 * `Window`s and `Worker`s are different.
 *
 * The worker will be terminated if the connection cannot be established.
 * After the connection is established, the worker will be terminated when
 * the `WxEnd` is closed.
 *
 * @param onRecv callback to register when receiving a message from the other end
 */
export const wxMakeWorkerEnd = async (
    worker: WorkerLike,
    onRecv: WxOnRecvFn,
    options?: WxEndOptions,
): Promise<WxResult<WxEnd>> => {
    // note that we are not handling worker.onerror and worker.onmessageerror.
    // worker.onerror could be triggered by user-land uncaught errors
    // in the worker can could be completely unrelated to us. messageerror
    // can only be triggered if there's an internal bug in the browser
    // or implementation of the SDK

    const controller = wxMakeMessageController(
        false,
        options?.timeout,
        onRecv,
        (handler, signal) => {
            worker.addEventListener("message", handler, { signal });
        },
        (message: WxMessage) => {
            worker.postMessage(message);
        },
    );
    if (controller.err) {
        worker.terminate?.();
        return controller;
    }

    const { start, close, isClosed, onClose } = controller.val;

    // terminate the worker when the connection is closed
    void onClose(() => {
        worker.terminate?.();
    });

    await start();

    const end: WxEnd = {
        send: (message) => {
            if (isClosed()) {
                return { err: { code: "Closed" } };
            }
            worker.postMessage(message);
            return {};
        },
        close,
        onClose,
        isClosed,
    };

    return { val: end };
};

/**
 * Create an `WxEnd` bound to the global `WorkerGlobalScope`.
 *
 * Calling this when `globalThis` is not a `WorkerGlobalScope` will result in an error.
 * Calling this function multiple times will return the same promise - even if previous
 * call returned an error.
 */
export const wxMakeWorkerGlobalEnd = once({
    fn: async (
        onRecv: WxOnRecvFn,
        option?: WxEndOptions,
    ): Promise<WxResult<WxEnd>> => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        if (
            !("WorkerGlobalScope" in globalThis) ||
            !(globalThis instanceof (globalThis as any).WorkerGlobalScope)
        ) {
            return {
                err: { code: "NotWorkerGlobalScope" },
            };
        }
        /* eslint-enable @typescript-eslint/no-explicit-any */

        const controller = wxMakeMessageController(
            true,
            option?.timeout,
            onRecv,
            (handler, signal) => {
                // worker global scope can only communicate with the thread
                // that created the worker, so we don't need extra handling
                (globalThis as unknown as WorkerLike).addEventListener(
                    "message",
                    handler,
                    { signal },
                );
            },
            (message: WxMessage) => {
                (globalThis as unknown as WorkerLike).postMessage(message);
            },
        );
        if (controller.err) {
            return controller;
        }

        const { start, close, isClosed, onClose } = controller.val;

        // onclose, tell the host (passive) end to terminate us
        void onClose(() => {
            (globalThis as unknown as WorkerLike).postMessage({
                s: wxInternalProtocol,
                p: wxInternalProtocol,
                m: 1,
                f: wxFuncClose,
                d: "close",
            });
        });

        await start();

        return {
            val: {
                send: (message) => {
                    if (isClosed()) {
                        return { err: { code: "Closed" } };
                    }
                    (globalThis as unknown as WorkerLike).postMessage(message);
                    return {};
                },
                close,
                onClose,
                isClosed,
            },
        };
    },
});

/**
 * Create a channel with 2 ends that can communicate with each other in the same context.
 * Calling `send` from one end will call the `onRecv` callback of the other end asynchronously.
 * Calling `close` on either end will close the channel immediately (any message sent but not received
 * will also not be received).
 */
export const wxMakeChannel = (
    onRecvA: WxOnRecvFn,
    onRecvB: WxOnRecvFn,
): [WxEnd, WxEnd] => {
    const { close, isClosed, onClose } = wxMakeCloseController();
    // sending close message from either side is equivalent
    // to calling close from either side
    const sendFromA = (message: WxMessage) => {
        if (isClosed()) {
            return { err: { code: "Closed" as const } };
        }
        setTimeout(() => {
            if (isClosed()) {
                return;
            }
            if (message.p === wxInternalProtocol && message.f === wxFuncClose) {
                close();
                return;
            }
            void onRecvB(message);
        }, 0);
        return {};
    };
    const sendFromB = (message: WxMessage) => {
        if (isClosed()) {
            return { err: { code: "Closed" as const } };
        }
        setTimeout(() => {
            if (isClosed()) {
                return;
            }
            if (message.p === wxInternalProtocol && message.f === wxFuncClose) {
                close();
                return;
            }
            void onRecvA(message);
        }, 0);
        return {};
    };
    return [
        { send: sendFromA, close, onClose, isClosed },
        { send: sendFromB, close, onClose, isClosed },
    ];
};
