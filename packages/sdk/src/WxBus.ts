import { errstr } from "@pistonite/pure/result";
import type { WxEnd, WxEndRecvFn } from "./WxEnd.ts";
import { WxError, WxPromise, WxResult, WxVoid } from "./WxError.ts";
import { wxFuncProtocol, wxFuncReturn, wxFuncReturnError, wxInternalProtocol, WxPayload } from "./WxMessage.ts";

/**
 * Base type shape for the config object passed into the bus creation function.
 *
 * For example: 
 * ```typescript
 * const config = {
 *     foo: fooproto(hostimpl satisfies HostImpl)
 * }
 * ```
 * where:
 * - `fooproto` is the generated protocol function, derived from `@workex:protocol fooproto`
 * - `HostImpl` is the input interface name
 * - `foo` will the name of the variable in the output object
 */
export type WxProtocolConfig = {
    [name: string]: WxProtocolBindConfig<any>;
}

export type WxProtocolBindConfig<TSender> = {
    bindSend: (sender: WxBusSender) => TSender,
    recvHandler: WxBusRecvHandler,
}

export type WxBusRecvHandler = (fId: number, data: unknown) => Promise<unknown>;

export type WxProtocolOutput<TConfig extends WxProtocolConfig> = {
    [K in keyof TConfig]: TConfig[K] extends WxProtocolBindConfig<infer TSender> ? TSender : never;
}

export type WxBusCreator<TConfig extends WxProtocolConfig> = 
(config: TConfig) => Promise<WxResult<WxProtocolOutput<TConfig>>>;

export const wxCreateBus = async <TConfig extends WxProtocolConfig>(
    isActiveSide: boolean,
    endCreator: (onRecv: WxEndRecvFn) => Promise<WxResult<WxEnd>>, 
    config: TConfig,
    timeout: number
): Promise<WxResult<WxProtocolOutput<TConfig>>> => {
    // extract configuration
    const protocols: string[] = [];
    const protocolToHandler: Record<string, WxBusRecvHandler> = {};
    const protocolToBindSender: Record<string, (sender: WxBusSender) => unknown> = {};
    for (const p in config) {
        const { bindSend, recvHandler } = config[p];
        protocols.push(p);
        protocolToHandler[p] = recvHandler;
        protocolToBindSender[p] = bindSend;
    }
    // sort the protocols. Since the input is an object, the order is not guaranteed
    // and should not matter in protocol agreement
    protocols.sort();

    // === Bus receive side handler ===
    // This handles:
    // - internal messages for protocol agreement
    // - routes return messages to pending promises
    // - routes incoming requests to the correct handler

    const pendingMessages: Map<number, (value: WxResult<unknown>) => void> = new Map();

    let resolveProtocol: (x: WxVoid) => void;
    const protocolPromise = new Promise<WxVoid>((resolve) => {
        resolveProtocol = resolve;
    });

    const onRecv = async ({p,m,f,d}: WxPayload) => {
        if (p === wxInternalProtocol) {
            // protocol agreement
            if (f === wxFuncProtocol) {
                const receivedProtocols = d as string[];
                if (m === 0) {
                    // query
                    const res = end.send({
                        s: wxInternalProtocol,
                        p: wxInternalProtocol,
                        m: shallowEqual(protocols, receivedProtocols) ? 1 : 2, // agree or disagree
                        f: wxFuncProtocol, 
                        d: protocols
                    });
                    if (res.err) {
                        resolveProtocol({ err: res.err });
                    }
                } else if (m === 1) {
                    // agree
                    resolveProtocol({});
                } else {
                    // disagree
                    resolveProtocol({ err: {
                        code: "ProtocolDisagree",
                        message: `received: ${receivedProtocols.join(", ")}, expected: ${protocols.join(", ")}}`
                    }});
                }
                return;
            }
            console.warn(`[workex] bus received unknown workex internal message: ${f}`);
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
                    }
                });
                if (res.err?.code === "Closed") {
                    // cannot send to the other side, silently close
                    end.close();
                }
            } else {
                // unknown protocol from response message, log and ignore
                console.warn(`[workex] bus received unknown protocol for a response message: ${p}`);
            }
            return;
        }

        // other side returning a value
        if (f === wxFuncReturn || f === wxFuncReturnError) {
            const pending = pendingMessages.get(m);
            if (!pending) {
                console.warn(`[workex] bus received response for unknown message id: ${m}`);
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
        try {
            const result = await handler(f, d);
            sendResult = end.send({
                s: wxInternalProtocol,
                p,
                m,
                f: wxFuncReturn,
                d: result
            });
        } catch (e) {
            sendResult = end.send({
                s: wxInternalProtocol,
                p,
                m,
                f: wxFuncReturn,
                d: {
                    code: "Catch",
                    message: errstr(e)
                } satisfies WxError
            });
        }

        if (sendResult.err?.code === "Closed") {
            console.warn(`[workex] bus failed to send response because the end is closed`);
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
            d: protocols
        });
        if (res.err) {
            console.error(`[workex] bus failed to query protocols, communication not established!`);
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
        console.error(`[workex] bus failed to agree on protocols, communication not established!`);
        return protocolRes;
    }

    // create the sender and link to the protocols
    const sender = new WxBusSender(end, pendingMessages, timeout);

    const protocolToSender: Record<string, unknown> = {};
    for (const p in protocolToBindSender) {
        protocolToSender[p] = protocolToBindSender[p](sender);
    }

    return { val: protocolToSender as WxProtocolOutput<TConfig> };
}

export class WxBusSender {
    private end: WxEnd;
    private pendingMessages: Map<number, (value: WxResult<unknown>) => void>;
    private timeout: number;

    private nextMessageId = 100;

    constructor(
        end: WxEnd, 
        pendingMessages: Map<number, (value: WxResult<unknown>) => void>,
        timeout: number
    ) {
        this.end = end;
        this.pendingMessages = pendingMessages;
        this.timeout = timeout;
    }

    public async sendVoid<TArgs>(protocol: string, fId: number, data: TArgs): WxPromise<void> {
        const result = await this.send<TArgs, unknown>(protocol, fId, data);
        if (result.err) {
            return result;
        }
        // make sure random "val" values don't get leaked
        return {};
    }

    public async send<TArgs, TReturn>(protocol: string, fId: number, data: TArgs): Promise<WxResult<TReturn>> {
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
            d: data
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
        return result as WxResult<TReturn>;
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
        if (this.nextMessageId >= 0x7FFFFFFF) {
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
}



// Bidirectional Unicall System
/// @workex:side extension
/// interface Extension
//
/// @workex:side app
/// interface ExtensionApp
//
// --protocol skybook -C Extension,ExtensionApp -C Runtime,RuntimeApp

// import { WorkexReturnFId } from "../utils";
//
// const api = {
//     ...
// } satisfies Extension
//
// const result = await wxWorkerGlobal(options)({
//     // here multiple workex generated buses can be added
//     app: skybookExtension(api),
// });
// const { app } = result.val;
//
// ;
//
//
//
// // app side
//
// const worker = new Worker();
// const app = {
//
// } satisfies ExtensionApp;
// const result = await wxWorker(worker, options)({
//     extension: skybext(app),
// });
//
// // window...
//
// const wxw = wxWindow().val;
// const result = await wxPopup(url, options)({
//     extension: makeExtensionAppBus(app),
// })
//
// // popup...
//
// const wxw = wxWindow().val;
// const result = await wxOwnerWindow(options)({
//     app: makeExtensionBus(api),
// })
