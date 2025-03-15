import { errstr } from "@pistonite/pure/result";
import { wxFail, WxResult, WxVoid } from "./WxError.ts";
import { isWxMessageEvent, wxFuncHandshake, wxFuncHello, wxHandshakeMsgHello, wxInternalProtocol, WxMessage, WxPayload } from "./WxMessage.ts";
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
    send: (message: WxMessage) => void;
    /** 
     * Close this end. This may or may not notify the other end about the closing
     */
    close: () => void;
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
    option?: WxEndOptions
): Promise<WxResult<WxEnd>> => {
    let isClosed = false;
    let closeReceiveWarned = false;

    const controller = new AbortController();
    try {
        worker.addEventListener("message", (event: unknown) => {
            if (!isWxMessageEvent(event)) {
                return;
            }
            const {p,m,f} = event.data;
            if (isClosed) {
                if (!closeReceiveWarned) {
                    closeReceiveWarned = true;
                    console.warn(`[workex] message received on an end that has been closed. p: ${p}, mID: ${m}, fID: ${f} (further warnings are suppressed)`);
                }
                return;
            }
            if (p === wxInternalProtocol) {
                if (f === wxFuncHandshake) {
                    // ignore hello messages on established channel
                    return;
                }
            }
            onRecv(event.data);
        }, { signal: controller.signal });
    } catch (e) {
        console.error(e);
        return {
            err: wxFail("Failed to addEventListener to Worker: " + errstr(e))
        }
    }

    // wait for handshake
    const helloPromise = new Promise<WxVoid>((resolve) => {
        try {
            const controller = new AbortController();
            (globalThis as unknown as WorkerLike).addEventListener("message", (event: unknown) => {
                if (!isWxMessageEvent(event)) {
                    return;
                }
                const {p, f, m} = event.data;
                if (p !== wxInternalProtocol) {
                    return;
                }
                if (f === wxFuncHandshake) {
                    if (m === wxHandshakeMsgHello) {
                        resolve({});
                        controller.abort();
                        return;
                    }
                    console.warn(`[workex] unknown handshake message with mID ${m}`);
                }
            }, { signal: controller.signal });
        } catch (e) {
            console.error(e);
            return resolve({
                err: wxFail("Failed to addEventListener to Worker: " + errstr(e))
            })
        };
    });
    const timeout = option?.timeout ?? 60000;
    const notice1 = setTimeout(() => {
        console.warn("[workex] connection has not been established after 1 second!");
    }, 1000);
    const notice2 = setTimeout(() => {
        console.warn("[workex] connection has not been established after 5 seconds!");
    }, 5000);
    const notice3 = setTimeout(() => {
        console.warn("[workex] connection has not been established after 10 seconds! (this is the last warning)");
    }, 10000);
    const result = await Promise.race([
        helloPromise,
        new Promise<WxVoid>((resolve) => {
            setTimeout(() => {
                controller.abort();
                resolve({ err: {
                    code: "HandshakeTimeout",
                    message: `Timeout after ${timeout}ms`
                } });
            }, timeout);
        })
    ]);
    clearTimeout(notice1);
    clearTimeout(notice2);
    clearTimeout(notice3);

    if (result.err) {
        return result;
    }

    const end: WxEnd = {
        close: () => {
            worker.terminate?.();
        },
        send: (message: WxMessage) => {
            worker.postMessage(message);
        }
    };
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

        const controller = new AbortController();

        try {
            (globalThis as unknown as WorkerLike).addEventListener("message", (event: unknown) => {
                if (!isWxMessageEvent(event)) {
                    return;
                }
                if (event.data.p !== wxInternalProtocol) {
                    onRecv(event.data);
                }
            }, { signal: controller.signal });
        } catch (e) {
            console.error(e);
            return {
                err: wxFail("Failed to addEventListener to Worker: " + errstr(e))
            }
        }
    
        const end: WxEnd = {
            close: () => {},
            send: (message: WxMessage) => {
                (globalThis as unknown as WorkerLike).postMessage(message);
            }
        };
    
        // initiate handshake
        const helloPromise = new Promise<WxVoid>((resolve) => {
            try {
                const controller = new AbortController();
                (globalThis as unknown as WorkerLike).addEventListener("message", (event: unknown) => {
                    if (!isWxMessageEvent(event)) {
                        return;
                    }
                    if (event.data.p === wxInternalProtocol && event.data.f === wxFuncHello) {
                        resolve({});
                        controller.abort();
                    }
                }, { signal: controller.signal });
            } catch (e) {
                console.error(e);
                return resolve({
                    err: wxFail("Failed to addEventListener to Worker: " + errstr(e))
                })
            };
        });

        let done = false;
        let count = 0;
        const send = () => {
            if (done) {
                return;
            }
            count++;
            (globalThis as unknown as WorkerLike).postMessage({ 
                s: wxInternalProtocol,
                p: wxInternalProtocol,
                m: 1,
                f: wxFuncHello,
                d: "hello"
            });
            if (count < 20) {
                setTimeout(send, 50);
                return;
            }
            setTimeout(send, 1000);
        };
        send();
    
        const timeout = option?.timeout ?? 60000;
        const notice1 = setTimeout(() => {
            console.warn("[workex] connection has not been established after 1 second!");
        }, 1000);
        const notice2 = setTimeout(() => {
            console.warn("[workex] connection has not been established after 5 seconds!");
        }, 5000);
        const notice3 = setTimeout(() => {
            console.warn("[workex] connection has not been established after 10 seconds! (this is the last warning)");
        }, 10000);
        const result = await Promise.race([
            helloPromise,
            new Promise<WxVoid>((resolve) => {
                setTimeout(() => {
                    controller.abort();
                    resolve({ err: {
                        code: "HandshakeTimeout",
                        message: `Timeout after ${timeout}ms`
                    } });
                }, timeout);
            })
        ]);
        done = true;
        clearTimeout(notice1);
        clearTimeout(notice2);
        clearTimeout(notice3);

        if (result.err) {
            return result;
        }
        
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
    const sendFromA = (message: WxPayload) => {
        setTimeout(() => {
            if (isClosed) {
                return;
            }
            onRecvB(message)
        }, 0);
    };
    const sendFromB = (message: WxPayload) => {
        setTimeout(() => {
            if (isClosed) {
                return;
            }
            onRecvA(message)
        }, 0);
    };
    const close = () => {
        isClosed = true;
    };
    return [
        { send: sendFromA, close },
        { send: sendFromB, close }
    ];
}
