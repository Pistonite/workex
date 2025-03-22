/**
 * Bidirectional Unicall System (BUS)
 */
import { errstr } from "@pistonite/pure/result";

import type { WxEnd, WxEndRecvFn } from "./WxEnd.ts";
import type { WxError, WxPromise, WxResult, WxVoid } from "./WxError.ts";
import {
    wxFuncProtocol,
    wxFuncReturn,
    wxFuncReturnError,
    wxInternalProtocol,
    type WxPayload,
} from "./WxMessage.ts";
import { wxMakePromise } from "./WxUtil.ts";

/**
 * Base type shape for the config object passed into the bus creation function.
 * This is used to get type inferrence for `wxCreateBus` function.
 */
export type WxProtocolConfig = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [name: string]: WxProtocolBindConfig<any>;
};

/**
 * This is the configuration object passed into the creator functions,
 * such as {@link wxWorker} and {@link wxPopup}. These are exported
 * by the `*.bus.ts` files generated by the Workex CLI tool.
 */
export type WxProtocolBindConfig<TSender> = {
    /** Name of the protocol (generated using --protocol flag) */
    protocol: string;
    /**
     * The protocol interfaces. The first should match TSender, the second
     * is the interface TSender is linked to
     */
    interfaces: [string, string];
    /** Handle for receiving remote calls */
    recvHandler: WxBusRecvHandler;
    /** Create send wrapper that implements the sender interface */
    bindSend: (sender: WxProtocolBoundSender) => TSender;
};

/**
 * Handler registered on the bus for handling RPC calls from the other side.
 * These functions are exported by the generated code and used by
 * the bind configuration. They are not meant to be called directly by user code.
 */
export type WxBusRecvHandler = (
    fId: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any[],
) => WxPromise<unknown> | WxPromise<void>;

/**
 * Type for creator functions that takes in a configuration object built from
 * generated {@link WxProtocolBindConfig} objects.
 */
export type WxBusCreator = <TConfig extends WxProtocolConfig>(
    config: TConfig,
) => Promise<WxResult<WxCreateBusOutput<TConfig>>>;

/**
 * Internal function used by creator functions to create the bus.
 */
export const wxCreateBus = async <TConfig extends WxProtocolConfig>(
    isActiveSide: boolean,
    endCreator: (onRecv: WxEndRecvFn) => Promise<WxResult<WxEnd>>,
    config: TConfig,
    timeout?: number,
): Promise<WxResult<WxCreateBusOutput<TConfig>>> => {
    if (!timeout || timeout < 0) {
        timeout = 60000;
    }
    // extract configuration
    const protocols = new Set<string>();
    const protocolQuery: string[] = [];
    const protocolToVariableKey: Record<string, string> = {};
    const protocolToHandler: Record<string, WxBusRecvHandler> = {};
    const protocolToBindSender: Record<
        string,
        (sender: WxProtocolBoundSender) => unknown
    > = {};
    for (const p in config) {
        const { protocol, interfaces, bindSend, recvHandler } = config[p];
        if (protocols.has(protocol)) {
            return {
                err: {
                    code: "DuplicateProtocol",
                    message: `Duplicate protocol: ${protocol}`,
                },
            };
        }
        protocols.add(protocol);

        // format query as PASSIVE->ACTIVE, where
        // PASSIVE/ACITVE are the side that implements the interface
        const [typeSend, typeRecv] = interfaces;
        if (isActiveSide) {
            protocolQuery.push(`${protocol}:${typeSend}->${typeRecv}`);
        } else {
            protocolQuery.push(`${protocol}:${typeRecv}->${typeSend}`);
        }
        protocolToHandler[protocol] = recvHandler;
        protocolToBindSender[protocol] = bindSend;
        protocolToVariableKey[protocol] = p;
    }
    // sort the protocols. Since the input is an object, the order is not guaranteed
    // and should not matter in protocol agreement
    protocolQuery.sort();

    // === Bus receive side handler ===
    // This handles:
    // - internal messages for protocol agreement
    // - routes return messages to pending promises
    // - routes incoming requests to the correct handler

    const pendingMessages: Map<number, (value: WxResult<unknown>) => void> =
        new Map();

    const { promise: protocolPromise, resolve: resolveProtocol } =
        wxMakePromise<WxVoid>();

    const onRecv = async ({ p, m, f, d }: WxPayload) => {
        if (p === wxInternalProtocol) {
            // protocol agreement
            if (f === wxFuncProtocol) {
                const receivedQuery = d as string[];
                if (m === 0) {
                    const agree = shallowEqual(protocolQuery, receivedQuery);
                    // query
                    const res = end.send({
                        s: wxInternalProtocol,
                        p: wxInternalProtocol,
                        m: agree ? 1 : 2, // agree or disagree
                        f: wxFuncProtocol,
                        d: protocolQuery,
                    });
                    if (agree) {
                        if (res.err) {
                            resolveProtocol({ err: res.err });
                        } else {
                            resolveProtocol({});
                        }
                        return;
                    }
                } else if (m === 1) {
                    // agree
                    resolveProtocol({});
                    return;
                }

                // disagree
                resolveProtocol({
                    err: {
                        code: "ProtocolDisagree",
                        message: `received: ${receivedQuery.join(", ")}, expected: ${protocolQuery.join(", ")}}`,
                    },
                });
                return;
            }
            console.warn(
                `[workex] bus received unknown workex internal message: ${f}`,
            );
            return;
        }

        // check if it's a known protocol
        const handler = protocolToHandler[p];
        if (!handler) {
            if (f !== wxFuncReturn && f !== wxFuncReturnError) {
                // unknown protocol from incoming requests, return an error
                const res = end.send({
                    s: wxInternalProtocol,
                    p: wxInternalProtocol,
                    m,
                    f: wxFuncReturnError,
                    d: {
                        code: "UnknownProtocol",
                    },
                });
                if (res.err?.code === "Closed") {
                    // cannot send to the other side, silently close
                    end.close();
                }
            } else {
                // unknown protocol from response message, log and ignore
                console.warn(
                    `[workex] bus received unknown protocol for a response message: ${p}`,
                );
            }
            return;
        }

        // other side returning a value
        if (f === wxFuncReturn || f === wxFuncReturnError) {
            const pending = pendingMessages.get(m);
            if (!pending) {
                console.warn(
                    `[workex] bus received response for unknown message id: ${m}`,
                );
                return;
            }
            pendingMessages.delete(m);
            if (f === wxFuncReturn) {
                pending({ val: d });
            } else {
                pending({ err: d as WxError });
            }
            return;
        }

        // other side sending a request
        let sendResult: WxResult<unknown>;
        if (!d || !Array.isArray(d)) {
            console.warn(`[workex] bus received invalid data for a request`);
            sendResult = end.send({
                s: wxInternalProtocol,
                p,
                m,
                f: wxFuncReturnError,
                d: {
                    code: "InvalidRequestData",
                } satisfies WxError,
            });
        } else {
            try {
                const result = await handler(f, d);
                if (!result) {
                    sendResult = end.send({
                        s: wxInternalProtocol,
                        p,
                        m,
                        f: wxFuncReturnError,
                        d: {
                            code: "NoReturn",
                        } satisfies WxError,
                    });
                } else if (result.err) {
                    sendResult = end.send({
                        s: wxInternalProtocol,
                        p,
                        m,
                        f: wxFuncReturnError,
                        d: result.err,
                    });
                } else {
                    sendResult = end.send({
                        s: wxInternalProtocol,
                        p,
                        m,
                        f: wxFuncReturn,
                        d: result.val,
                    });
                }
            } catch (e) {
                sendResult = end.send({
                    s: wxInternalProtocol,
                    p,
                    m,
                    f: wxFuncReturnError,
                    d: {
                        code: "Catch",
                        message: errstr(e),
                    } satisfies WxError,
                });
            }
        }

        if (sendResult.err?.code === "Closed") {
            console.warn(
                `[workex] bus failed to send response because the end is closed`,
            );
            end.close();
            return;
        }
    };

    // create the end, which establishes connection
    const endResult = await endCreator(onRecv);
    if (endResult.err) {
        return endResult;
    }
    const end = endResult.val;

    const removeProtocolSubscriber = end.onClose(() => {
        resolveProtocol({ err: { code: "Closed" } });
    });

    if (isActiveSide) {
        // agree on protocols with the other end
        const res = end.send({
            s: wxInternalProtocol,
            p: wxInternalProtocol,
            m: 0,
            f: wxFuncProtocol,
            d: protocolQuery,
        });
        if (res.err) {
            console.error(
                `[workex] bus failed to query protocols, communication not established!`,
            );
            end.close();
            return res;
        }
    }

    const timeoutPromise = new Promise<WxVoid>((resolve) => {
        setTimeout(() => {
            resolve({ err: { code: "Timeout" } });
        }, timeout);
    });

    // wait for protocol agreement
    const protocolRes = await Promise.race([protocolPromise, timeoutPromise]);
    removeProtocolSubscriber();
    if (protocolRes.err) {
        end.close();
        console.error(
            `[workex] bus failed to agree on protocols, communication not established!`,
        );
        return protocolRes;
    }

    // create the sender and link to the protocols
    const sender = new WxBusSender(end, pendingMessages, timeout);

    const keyToSender: Record<string, unknown> = {};
    for (const protocol in protocolToBindSender) {
        keyToSender[protocolToVariableKey[protocol]] = protocolToBindSender[
            protocol
        ](new WxProtocolBoundSenderImpl(sender, protocol));
    }

    return { val: {
        connection: end,
        protocols: keyToSender as WxProtocolOutput<TConfig> }};
};

/**
 * Sender type bound to a specific protocol.
 *
 * This is the internal type used by generated sender classes to execute RPC calls.
 */
export type WxProtocolBoundSender = {
    /** Send a call and ignore the returned value */
    sendVoid(fId: number, data: unknown[]): WxPromise<void>;
    /** Send a call */
    send<TReturn>(fId: number, data: unknown[]): WxPromise<TReturn>;
};

class WxProtocolBoundSenderImpl implements WxProtocolBoundSender {
    private sender: WxBusSender;
    private protocol: string;

    constructor(sender: WxBusSender, protocol: string) {
        this.sender = sender;
        this.protocol = protocol;
    }

    public async sendVoid(fId: number, data: unknown[]): WxPromise<void> {
        const result = await this.sender.send(this.protocol, fId, data);
        if (result.err) {
            return result;
        }
        // make sure random "val" values don't get leaked
        return {};
    }

    public async send<TReturn>(
        fId: number,
        data: unknown[],
    ): WxPromise<TReturn> {
        return this.sender.send<TReturn>(this.protocol, fId, data);
    }
}

class WxBusSender {
    private end: WxEnd;
    private pendingMessages: Map<number, (value: WxResult<unknown>) => void>;
    private timeout: number;

    private nextMessageId = 100;

    constructor(
        end: WxEnd,
        pendingMessages: Map<number, (value: WxResult<unknown>) => void>,
        timeout: number,
    ) {
        this.end = end;
        this.pendingMessages = pendingMessages;
        this.timeout = timeout;
    }

    public async send<TReturn>(
        protocol: string,
        fId: number,
        data: unknown[],
    ): WxPromise<TReturn> {
        const mIdRes = this.nextMId();
        if (mIdRes.err) {
            return mIdRes;
        }
        const mId = mIdRes.val;
        const res = this.end.send({
            s: wxInternalProtocol,
            p: protocol,
            m: mId,
            f: fId,
            d: data,
        });
        if (res.err) {
            return res;
        }

        const responsePromise = new Promise<WxResult<unknown>>((resolve) => {
            this.pendingMessages.set(mId, resolve);
        });
        const timeoutPromise = new Promise<WxResult<unknown>>((resolve) => {
            setTimeout(() => {
                this.pendingMessages.delete(mId);
                resolve({ err: { code: "Timeout" } });
            }, this.timeout);
        });

        const result = await Promise.race([responsePromise, timeoutPromise]);
        return result as Awaited<WxPromise<TReturn>>;
    }

    private nextMId(): WxResult<number> {
        let m = this.incrementMId();
        // handle message id collision
        if (this.pendingMessages.has(m)) {
            const initialMId = m;
            while (this.pendingMessages.has(m)) {
                m = this.incrementMId();
                if (m === initialMId) {
                    return {
                        err: {
                            code: "Fail",
                            message: "No available message id",
                        },
                    };
                }
            }
        }
        return { val: m };
    }

    private incrementMId() {
        // make sure it's representable in 32-bit signed integer
        // for max compatibility with different runtimes
        if (this.nextMessageId >= 0x7fffffff) {
            this.nextMessageId = 100;
        }
        return this.nextMessageId++;
    }
}

const shallowEqual = (a: string[], b: string[]) => {
    const aLen = a.length;
    if (aLen !== b.length) {
        return false;
    }
    for (let i = 0; i < aLen; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
};

export type WxCreateBusOutput<TConfig extends WxProtocolConfig> = {
    connection: WxBusHandle;
    protocols: WxProtocolOutput<TConfig>;
};

export type WxBusHandle = {
    /** Close the bus, and the underlying connection */
    close: () => void;
    /**
     * Add a subscriber to be called when the underlying connection is closed
     */
    onClose: (callback: () => void) => () => void;
}

/**
 * Output of wxCreateBus
 */
export type WxProtocolOutput<TConfig extends WxProtocolConfig> = {
    [K in keyof TConfig]: TConfig[K] extends WxProtocolBindConfig<infer TSender>
        ? TSender
        : never;
};
