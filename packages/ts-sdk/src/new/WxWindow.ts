import { once } from "@pistonite/pure/sync";
import { errstr } from "@pistonite/pure/result";

import { wxChannel, WxEnd, WxEndOptions, WxEndRecvFn } from "./WxEnd.ts"
import { wxFail, WxResult, WxVoid } from "./WxError.ts"
import { isWxMessageEvent, wxFuncClose, wxFuncHello, wxInternalProtocol, WxMessage } from "./WxMessage.ts";

/**
 * Things that looks like a `Window`
 */
export type WindowLike = {
    postMessage: (message: any, targetOrigin: string) => any;
    addEventListener: (type: string, listener: (event: any) => any, options?: {signal?: unknown}) => any;
    opener?: WindowLike | null;
    parent?: WindowLike | null;
    location?: {
        origin?: string;
    },
    open: (url: string, target: string, features: string) => WindowLike | null;
    close?: () => void;
};

export type IFrameLike = {
    src: string,
    contentWindow: WindowLike
}

const wxSameContextGlobalEndCreator = "__workex_scgec";

/**
 * Controller for the global `Window` object
 * for talking to other `Window`s
 * 
 */
export type WxWindow = {
    /**
     * Create a {@link WxEnd} for messaging to the owner of the window.
     * For window opened with `window.open`, this is the window that opened the window (i.e. the `window.opener` object).
     * For iframes, this is the window that contains the iframe (i.e. the `window.parent` object).
     * 
     * Note that if this window and the owner are same-origin, the browser may put them in the same context,
     * in which case messaging is done by directly calling the handler, since they are in the same context.
     */
    owner(ownerOrigin: string, onRecv: WxEndRecvFn, options?: WxEndOptions): Promise<WxResult<WxEnd>>;

    /**
     * Open a Popup window and create a {@link WxEnd} for messaging to that window
     */
    openPopup(url: string, onRecv: WxEndRecvFn, options?: WxWindowOpenOptions): Promise<WxResult<WxEnd>>;

    /**
     * Create a {@link WxEnd} for messaging to an iframe
     */
    connectFrame(iframe: IFrameLike, onRecv: WxEndRecvFn, options?: WxFrameLinkOptions): Promise<WxResult<WxEnd>>;
}

export type WxWindowOpenOptions = WxEndOptions & {
    width?: number;
    height?: number;
    /** 
     * Decides what to do when close() is called from the popup.
     * 
     * This callback will be registered to the pagehide event of the popup window
     */
    onClose?: () => void;
}

export type WxFrameLinkOptions = WxEndOptions & {
    /** Decides what to do when close() is called from within the frame */
    onClose?: () => void;
}

let wxWindowGlobal: WxWindow | undefined = undefined;

/**
 * Create a new `WxWindow` that wraps the global `Window` object
 */
export const wxWindow = (): WxResult<WxWindow> => {
    if (wxWindowGlobal !== undefined) {
        return { val: wxWindowGlobal };
    }
    if (!("Window" in globalThis) || !(globalThis instanceof (globalThis as any).Window)) {
        return {
            err: {
                code: "NotWindow"
            }
        }
    }

    // prepare owner for linking
    let owner: WxWindow["owner"];
    const opener = (globalThis as unknown as WindowLike).opener;
    const parent = (globalThis as unknown as WindowLike).parent;
    const selfOrigin = (globalThis as unknown as WindowLike).location?.origin;
    if (!selfOrigin) {
        return {
            err: {
                code: "NoOriginForWindow"
            }
        }
    }
    if (parent) {
        owner = createOwnerFnFor(parent, selfOrigin);
    } else if (opener) {
        owner = createOwnerFnFor(opener, selfOrigin);
    } else {
        owner = () => Promise.resolve({ err: { code: "NoOwnerForWindow" } });
    }

    const openPopup = async (url: string, onRecv: WxEndRecvFn, options?: WxWindowOpenOptions): Promise<WxResult<WxEnd>> => {
        let targetOrigin: string;
        try {
            targetOrigin = new URL(url).origin;
        } catch (e) {
            console.error(e);
            return { err: {
                code: "InvalidUrl",
                message: "Failed to parse URL: " + errstr(e)
            } };
        }

        let features = "popup";
        if (options?.width) {
            features += `,width=${options.width}`;
        }
        if (options?.height) {
            features += `,height=${options.height}`;
        }
        let targetWindow: WindowLike | null = null;
        try {
            targetWindow = (globalThis as unknown as WindowLike).open(url, "_blank", features);
        } catch (e) {
            console.error(e);
            targetWindow = null;
        }
        if (!targetWindow) {
            return { err: wxFail("Failed to open popup") };
        }

        const onClose = options?.onClose;
        if (onClose) {
            targetWindow.addEventListener("pagehide", onClose);
        }

        const close = () => {
            targetWindow?.close?.();
        }

        return await linkToTargetWindow(selfOrigin, targetWindow, targetOrigin, onRecv, close, options);
    };

    const connectFrame = async (iframe: IFrameLike, onRecv: WxEndRecvFn, options?: WxFrameLinkOptions): Promise<WxResult<WxEnd>> => {
        let targetOrigin: string;
        try {
            targetOrigin = new URL(iframe.src).origin;
        } catch (e) {
            console.error(e);
            return { err: {
                code: "InvalidUrl",
                message: "Failed to parse URL: " + errstr(e)
            } };
        }

        const onClose = options?.onClose;
        return await linkToTargetWindow(selfOrigin, iframe.contentWindow, targetOrigin, onRecv, onClose ?? (() => {}), options);
    }

    wxWindowGlobal = {
        owner,
        openPopup,
        connectFrame
    };

    return { val: wxWindowGlobal };
}

const createOwnerFnFor = (ownerWindow: WindowLike, origin: string): WxWindow["owner"] => {
    return once({
        fn: async (ownerOrigin: string, onRecv: WxEndRecvFn, options?: WxEndOptions): Promise<WxResult<WxEnd>> => {
            if (wxSameContextGlobalEndCreator in globalThis) {
                const globalEndCreator = (globalThis as any)[wxSameContextGlobalEndCreator];
                (globalThis as any)[wxSameContextGlobalEndCreator] = undefined;
                if (origin === ownerOrigin) {
                    if (globalEndCreator && typeof globalEndCreator === "function") {
                        try {
                            const end: WxResult<WxEnd> = await globalEndCreator(onRecv);
                            if ("val" in end || "err" in end) {
                                return end;
                            }
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }
                console.warn("[workex] same-origin same-context linking failed, falling back to postMessage");
            }
            
            const controller = new AbortController();
            try {
                (globalThis as unknown as WindowLike).addEventListener("message", (event: unknown) => {
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
                    err: wxFail("Failed to addEventListener to Window: " + errstr(e))
                }
            }

            // initiate handshake
            const helloPromise = new Promise<WxVoid>((resolve) => {
                try {
                    const controller = new AbortController();
                    (globalThis as unknown as WindowLike).addEventListener("message", (event: unknown) => {
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
                        err: wxFail("Failed to addEventListener to Window: " + errstr(e))
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
                ownerWindow.postMessage({ 
                    s: wxInternalProtocol,
                    p: wxInternalProtocol,
                    m: 1,
                    f: wxFuncHello,
                    d: "hello"
                }, ownerOrigin);
                if (count < 20) {
                    setTimeout(send, 50);
                    return;
                }
                setTimeout(send, 1000);
            };
            send();
        
            const timeout = options?.timeout ?? 60000;
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

            const end: WxEnd = {
                close: () => {
                    // send close message to owner to let it close us
                    ownerWindow.postMessage({
                        s: wxInternalProtocol,
                        p: wxInternalProtocol,
                        m: 1,
                        f: wxFuncClose,
                        d: "close"
                    }, ownerOrigin);
                },
                send: (message: WxMessage) => {
                    ownerWindow.postMessage(message, ownerOrigin);
                }
            };
            
            return { val: end };
        }
    });
}

const linkToTargetWindow = (
    selfOrigin: string,
    targetWindow: WindowLike, 
    targetOrigin: string, 
    onRecv: WxEndRecvFn, 
    close: () => void,
    options?: WxEndOptions
): Promise<WxResult<WxEnd>> => {
    const messagingEnd = {
        send: (message: WxMessage) => {
            targetWindow.postMessage(message, targetOrigin);
        },
        close
    };

    let theController: AbortController | undefined = undefined;

    // setting the global end creator for same-origin same-context linking
    // this should be fine (no race condition) because if this is doable,
    // then the other window can't possibly start execute until this function is done
    const helloPromise = new Promise<WxResult<WxEnd>>((resolve) => {
        if (targetOrigin === selfOrigin) {
            try {
                (targetWindow as any)[wxSameContextGlobalEndCreator] = (onRecvB: WxEndRecvFn) => {
                    const [endA, endB] = wxChannel(onRecv, onRecvB);
                    const originalClose = endA.close;
                    endA.close = () => {
                        originalClose();
                        close();
                    }
                    resolve({ val: endA });
                    return { val: endB };
                }
                return;
            } catch (e) {
                console.error(e);
            }
        }
        console.warn("[workex] same-origin same-context linking failed, falling back to postMessage");
        const overallController = new AbortController();
        theController = overallController;
        try {
            (globalThis as unknown as WindowLike).addEventListener("message", (event: unknown) => {
                if (!isWxMessageEvent(event)) {
                    return;
                }
                if (event.data.p !== wxInternalProtocol) {
                    onRecv(event.data);
                }
            }, { signal: overallController.signal });
        } catch (e) {
            console.error(e);
            return {
                err: wxFail("Failed to addEventListener to Worker: " + errstr(e))
            }
        }
        
        // wait for handshake
        try {
            const controller = new AbortController();
            (globalThis as unknown as WindowLike).addEventListener("message", (event: unknown) => {
                if (!isWxMessageEvent(event)) {
                    return;
                }
                if (event.data.p === wxInternalProtocol && event.data.f === wxFuncHello) {
                    resolve({val: messagingEnd});
                    controller.abort();
                }
            }, { signal: controller.signal });
        } catch (e) {
            console.error(e);
            return resolve({
                err: wxFail("Failed to addEventListener to Window: " + errstr(e))
            })
        };
    });
    const timeout = options?.timeout ?? 60000;
    const notice1 = setTimeout(() => {
        console.warn("[workex] connection has not been established after 1 second!");
    }, 1000);
    const notice2 = setTimeout(() => {
        console.warn("[workex] connection has not been established after 5 seconds!");
    }, 5000);
    const notice3 = setTimeout(() => {
        console.warn("[workex] connection has not been established after 10 seconds! (this is the last warning)");
    }, 10000);

    const continuation = async () => {
        const result = await Promise.race([
            helloPromise,
            new Promise<WxResult<WxEnd>>((resolve) => {
                setTimeout(() => {
                    theController?.abort();
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
        return result;
    };
    return continuation();

}