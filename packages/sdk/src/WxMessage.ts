import { errstr } from "@pistonite/pure/result";

import type { WxEndRecvFn } from "./WxEnd.ts";
import type { WxResult, WxVoid } from "./WxError.ts";
import { log } from "./wx_log.ts";

/**
 * Payload sendable to a {@link WxEnd}
 */
export type WxPayload = {
    /**
     * The protocol identifier. Listeners on the other side
     * maybe use this identifier to choose if they should handle or ignore
     * the payload
     *
     * The protocol "workex" is reserved for internal communication
     */
    p: string;

    /**
     * Message identifier.
     *
     * This is a serial number generated per RPC call to route the returned
     * response to the promise that is waiting for it.
     *
     * Messages 0-99 are reserved for internal use. Regular RPC calls
     * will start from 100. Note that the first few messages are used
     * to register the buses
     */
    m: number;

    /**
     * Function identifier.
     *
     * This is a unique identifier inside the protocol that identifies
     * the function that is being called by RPC. For response messages,
     * this indicates if the response is a return (0) or catch (1)
     *
     * Functions 0-31 are reserved for internal use in workex library
     */
    f: number;

    /**
     * Data payload.
     *
     * This is anything transferrable by the underlying messaging channel.
     * For example, for Workers, this is any transferreable object. For web requests,
     * this should probably be something seraializable to JSON.
     */
    d: unknown;
};

/**
 * Internal protocol used for implementation of lower-level
 * communication before control is passed to user-defined interfaces
 */
export const wxInternalProtocol = "workex" as const;

export const wxFuncReturn = 0 as const;

export const wxFuncReturnError = 1 as const;

/**
 * Func ID used for handshake. The message ID determines the message type
 * This func ID is used when establishing connection when creating {@link WxEnd}
 *
 * This func ID is handled by {@link WxEnd}
 */
export const wxFuncHandshake = 2 as const;
/** Hello handshake message */
export const wxHandshakeMsgHello = 1 as const;

/**
 * Func ID used to request closing the connection. Only active side can send this.
 * On the passive side, calling close() will destroy the active side and the
 * active side may not know about it
 *
 * This func ID is handled by {@link WxEnd}
 */
export const wxFuncClose = 3 as const;

/**
 * Func ID used to register and bind buses. This is handled by the Bus layer
 *
 * Active side sends this:
 * - m: unused
 * - d: array of protocol names
 *
 * Passive side returns:
 * - m: 0 = query, 1 = agree, 2 = disagree
 * - d: array of protocol names
 *
 *
 */
export const wxFuncProtocol = 4 as const;

/**
 * Message object with the `s` field set to "workex" to not be confused with messages
 * with other libraries
 */
export type WxMessage = WxPayload & { s: typeof wxInternalProtocol };

export const isWxMessageEvent = (
    event: unknown,
): event is { data: WxPayload } => {
    if (!event) {
        return false;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (event as any).data;
    if (!data || data.s !== "workex") {
        return false;
    }

    if (!data.p) {
        return false;
    }

    return (
        typeof data.m === "number" && typeof data.f === "number" && "d" in data
    );
};

/**
 * Controller for the lowest level of message passing using `MessageEvent`s.
 * This is used internally by {@link WxEnd}
 */
export type WxMessageController = WxCloseController & {
    /**
     * Start the handshake process.
     */
    start: () => Promise<WxVoid>;
};

/** Wrapper function for adding listener for `"message"` events */
export type AddMessageEventListenerFn = (
    listener: (event: unknown) => void,
    signal: unknown,
) => void;

/**
 * Create a {@link WxMessageController} that handles the lowest
 * level of message passing using `MesasgeEvent`s
 */
export const wxMakeMessageController = (
    /** If the side is the active side */
    isActiveSide: boolean,
    timeout_: number | undefined | null,
    onRecv: WxEndRecvFn,
    addMessageEventListener: AddMessageEventListenerFn,
    postMessage: (message: WxMessage) => void,
): WxResult<WxMessageController> => {
    // default timeout
    const timeout = !timeout_ || timeout_ <= 0 ? 60000 : timeout_;

    const { close, isClosed, onClose } = wxMakeCloseController();

    const eventHandlerController = new AbortController();
    // unregister the event handler when closing the channel
    void onClose(() => {
        eventHandlerController.abort();
    });

    const handshakeController = new AbortController();
    const removeHandshakeCloseListener = onClose(() => {
        handshakeController.abort();
    });
    const cleanupHandshake = () => {
        handshakeController.abort();
        removeHandshakeCloseListener();
    };

    try {
        addMessageEventListener((event: unknown) => {
            if (!isWxMessageEvent(event)) {
                return;
            }
            const { p, f } = event.data;
            if (isClosed()) {
                return;
            }
            if (p === wxInternalProtocol) {
                if (f === wxFuncHandshake) {
                    // ignore hello messages on established channel
                    return;
                }
                if (f === wxFuncClose) {
                    close();
                    return;
                }
            }
            // route the message to the bus handler
            void onRecv(event.data);
        }, eventHandlerController.signal);
    } catch (e) {
        close();
        log.error(e);
        return {
            err: {
                code: "AddEventListenerFail",
                message: "Error calling addEventListener: " + errstr(e),
            },
        };
    }

    const executeHandshake = () =>
        new Promise<WxVoid>((resolve) => {
            // initiator will fire hello messages on an interval until hello is received
            // from the other end. The other end will respond with hello whenever
            // it receives a hello message
            if (isActiveSide) {
                let done = false;
                try {
                    addMessageEventListener((event: unknown) => {
                        if (!isWxMessageEvent(event)) {
                            return;
                        }
                        const { p, f, m } = event.data;
                        if (p !== wxInternalProtocol) {
                            return;
                        }
                        if (isClosed()) {
                            return;
                        }
                        if (f === wxFuncHandshake) {
                            if (m === wxHandshakeMsgHello) {
                                // got hello back from other side
                                done = true;
                                resolve({});
                                return;
                            }
                            log.warn(`unknown handshake message with mID ${m}`);
                        }
                    }, handshakeController.signal);
                } catch (e) {
                    log.error(e);
                    return {
                        err: {
                            code: "AddEventListenerFail",
                            message:
                                "Error calling addEventListener when initiating handshake: " +
                                errstr(e),
                        },
                    };
                }
                let count = 0;
                const send = () => {
                    if (done) {
                        return;
                    }
                    count++;
                    postMessage({
                        s: wxInternalProtocol,
                        p: wxInternalProtocol,
                        m: wxHandshakeMsgHello,
                        f: wxFuncHandshake,
                        d: "hello",
                    });
                    if (count < 20) {
                        setTimeout(send, 50);
                        return;
                    }
                    setTimeout(send, 1000);
                };
                send();
            } else {
                try {
                    addMessageEventListener((event: unknown) => {
                        if (!isWxMessageEvent(event)) {
                            return;
                        }
                        const { p, f, m } = event.data;
                        if (p !== wxInternalProtocol) {
                            return;
                        }
                        if (f === wxFuncHandshake) {
                            if (m === wxHandshakeMsgHello) {
                                // post hello back
                                postMessage({
                                    s: wxInternalProtocol,
                                    p: wxInternalProtocol,
                                    m: wxHandshakeMsgHello,
                                    f: wxFuncHandshake,
                                    d: "hello",
                                });
                                resolve({});
                                return;
                            }
                            log.warn(`unknown handshake message with mID ${m}`);
                        }
                    }, handshakeController.signal);
                } catch (e) {
                    log.error(e);
                    return {
                        err: {
                            code: "AddEventListenerFail",
                            message:
                                "Error calling addEventListener when waiting for handshake: " +
                                errstr(e),
                        },
                    };
                }
            }
        });

    const start = async () => {
        const handshakePromise = executeHandshake();
        const notice1 = setTimeout(() => {
            log.warn("connection has not been established after 1 second!");
        }, 1000);
        const notice2 = setTimeout(() => {
            log.warn("connection has not been established after 5 seconds!");
        }, 5000);
        const notice3 = setTimeout(() => {
            log.warn("connection has not been established after 10 seconds! (this is the last warning)");
        }, 10000);
        const result = await Promise.race([
            handshakePromise,
            new Promise<WxVoid>((resolve) => {
                setTimeout(() => {
                    resolve({
                        err: {
                            code: "Timeout",
                        },
                    });
                }, timeout);
            }),
        ]);
        cleanupHandshake();
        clearTimeout(notice1);
        clearTimeout(notice2);
        clearTimeout(notice3);
        if (result.err) {
            close();
        }
        return result;
    };

    return { val: { start, close, isClosed, onClose } };
};

/**
 * Controller for closing the messaging channel
 */
export type WxCloseController = {
    /**
     * Mark the channel as closed and unregisters all message handlers
     * registered by the end. If handshake is still in progress, it will
     * be aborted.
     */
    close: () => void;

    /**
     * Add a subscriber to the close event. The subscriber will be called
     * when the end is closed at most once
     */
    onClose: (callback: () => void) => () => void;

    /** Check if the end is closed */
    isClosed: () => boolean;
};

export const wxMakeCloseController = (): WxCloseController => {
    let isClosed = false;
    const subscribers: (() => void)[] = [];
    const onClose = (callback: () => void) => {
        subscribers.push(callback);
        return () => {
            const index = subscribers.indexOf(callback);
            if (index !== -1) {
                subscribers.splice(index, 1);
            }
        };
    };
    const close = () => {
        // ensure we only close once
        if (isClosed) {
            return;
        }
        isClosed = true;
        for (const subscriber of subscribers) {
            subscriber();
        }
    };

    return { close, onClose, isClosed: () => isClosed };
};
