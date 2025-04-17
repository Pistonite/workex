import { once } from "@pistonite/pure/sync";
import { errstr } from "@pistonite/pure/result";

import {
    wxMakeChannel,
    type WxEnd,
    type WxEndOptions,
    type WxEndRecvFn,
} from "./WxEnd.ts";
import { wxFail, type WxResult } from "./WxError.ts";
import {
    wxMakeMessageController,
    wxFuncClose,
    wxInternalProtocol,
    type WxMessage,
} from "./WxMessage.ts";

/**
 * Things that looks like a `Window`
 */
export type WindowLike = {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    postMessage: (message: any, targetOrigin: string) => any;
    addEventListener: (
        type: string,
        listener: (event: any) => any,
        options?: { signal?: any },
    ) => any;
    opener?: WindowLike | null;
    parent?: WindowLike | null;
    location?: {
        origin?: string;
    };
    open: (url: string, target: string, features: string) => WindowLike | null;
    close?: () => void;
    closed?: boolean;
    /* eslint-enable @typescript-eslint/no-explicit-any */
};

export type IFrameLike = {
    src: string;
    contentWindow?: WindowLike | null;
};

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
    owner(
        ownerOrigin: string,
        onRecv: WxEndRecvFn,
        options?: WxEndOptions,
    ): Promise<WxResult<WxEnd>>;

    /**
     * Open a Popup window and create a {@link WxEnd} for messaging to that window.
     *
     * The returned end is tied to the window. If either the window or the end is closed,
     * the popup window and the connection will be closed.
     */
    popup(
        url: string,
        onRecv: WxEndRecvFn,
        options?: WxWindowOpenOptions,
    ): Promise<WxResult<WxEnd>>;

    /**
     * Create a {@link WxEnd} for messaging to an iframe
     */
    frame(
        iframe: IFrameLike,
        onRecv: WxEndRecvFn,
        options?: WxFrameLinkOptions,
    ): Promise<WxResult<WxEnd>>;
};

/**
 * Options for opening a window. See {@link wxPopup}
 */
export type WxWindowOpenOptions = WxEndOptions & {
    width?: number;
    height?: number;
};

/**
 * Options for linking to an iframe. See {@link wxFrame}
 */
export type WxFrameLinkOptions = WxEndOptions;

let wxWindowGlobal: WxWindow | undefined = undefined;

/**
 * Create a new `WxWindow` that wraps the global `Window` object
 */
export const wxWindow = (): WxResult<WxWindow> => {
    if (wxWindowGlobal !== undefined) {
        return { val: wxWindowGlobal };
    }
    /* eslint-disable @typescript-eslint/no-explicit-any */
    if (
        !("Window" in globalThis) ||
        !(globalThis instanceof (globalThis as any).Window)
    ) {
        return {
            err: {
                code: "NotWindow",
            },
        };
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const selfOrigin = (globalThis as unknown as WindowLike).location?.origin;
    if (!selfOrigin) {
        return {
            err: {
                code: "NoOriginForWindow",
            },
        };
    }
    // prepare owner for linking
    let owner: WxWindow["owner"];
    const opener = (globalThis as unknown as WindowLike).opener;
    const parent = (globalThis as unknown as WindowLike).parent;
    // we must check opener first, because window.parent can be self
    // when opener is not self
    if (opener) {
        owner = createOwnerFnFor(opener, selfOrigin);
    } else if (parent) {
        owner = createOwnerFnFor(parent, selfOrigin);
    } else {
        owner = () => Promise.resolve({ err: { code: "NoOwnerForWindow" } });
    }

    const popup = async (
        url: string,
        onRecv: WxEndRecvFn,
        options?: WxWindowOpenOptions,
    ): Promise<WxResult<WxEnd>> => {
        let targetOrigin: string;
        try {
            targetOrigin = new URL(url).origin;
        } catch (e) {
            console.error(e);
            return {
                err: {
                    code: "InvalidUrl",
                    message: "Failed to parse URL: " + errstr(e),
                },
            };
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
            targetWindow = (globalThis as unknown as WindowLike).open(
                url,
                "_blank",
                features,
            );
        } catch (e) {
            console.error(e);
            targetWindow = null;
        }
        if (!targetWindow) {
            return { err: wxFail("Failed to open popup") };
        }

        const end = await linkToTargetWindow(
            selfOrigin,
            targetWindow,
            targetOrigin,
            onRecv,
            options,
        );
        if (end.err) {
            return end;
        }

        // when closing this page, also close the popup
        const controllerClosePopupWhenClosingSelf = new AbortController();
        (globalThis as unknown as WindowLike).addEventListener(
            "pagehide",
            end.val.close,
            { signal: controllerClosePopupWhenClosingSelf.signal },
        );
        void end.val.onClose(() => {
            controllerClosePopupWhenClosingSelf.abort();
            // attempt to close the window, ignore errors
            try {
                targetWindow?.close?.();
            } catch (e) {
                console.error(e);
            }
        });

        return end;
    };

    const frame = async (
        iframe: IFrameLike,
        onRecv: WxEndRecvFn,
        options?: WxFrameLinkOptions,
    ): Promise<WxResult<WxEnd>> => {
        let targetOrigin: string;
        try {
            targetOrigin = new URL(iframe.src).origin;
        } catch (e) {
            console.error(e);
            return {
                err: {
                    code: "InvalidUrl",
                    message: "Failed to parse URL: " + errstr(e),
                },
            };
        }

        if (!iframe.contentWindow) {
            return { err: wxFail("IFrame has no contentWindow") };
        }

        // for frames, there's no need to handle window open/close since it's embedded.
        // user can call onClose themselves to decide what to do

        return await linkToTargetWindow(
            selfOrigin,
            iframe.contentWindow,
            targetOrigin,
            onRecv,
            options,
        );
    };

    wxWindowGlobal = {
        owner,
        popup,
        frame,
    };

    return { val: wxWindowGlobal };
};

const createOwnerFnFor = (
    ownerWindow: WindowLike,
    origin: string,
): WxWindow["owner"] => {
    return once({
        fn: async (
            ownerOrigin: string,
            onRecv: WxEndRecvFn,
            options?: WxEndOptions,
        ): Promise<WxResult<WxEnd>> => {
            // same origin, get the global end creator from the owner
            if (origin === ownerOrigin) {
                if (wxSameContextGlobalEndCreator in globalThis) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const globalEndCreator = (globalThis as any)[
                        wxSameContextGlobalEndCreator
                    ];
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (globalThis as any)[wxSameContextGlobalEndCreator] =
                        undefined;
                    if (
                        globalEndCreator &&
                        typeof globalEndCreator === "function"
                    ) {
                        try {
                            const end: WxResult<WxEnd> =
                                await globalEndCreator(onRecv);
                            // close the connection when this window is closed
                            if (end.val) {
                                (
                                    globalThis as unknown as WindowLike
                                ).addEventListener("pagehide", () => {
                                    end.val.close();
                                });
                                // for same origin linking, closing the end is enough
                                // to notify the other side to trigger close listeners
                                // and close the window
                            }
                            if ("val" in end || "err" in end) {
                                return end;
                            }
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }
                return {
                    err: wxFail("Same-origin same-context linking failed"),
                };
            }

            // cross-origin
            const controller = wxMakeMessageController(
                true,
                options?.timeout,
                onRecv,
                (handler, signal) => {
                    // messages from the target window will be posted to globalThis (shared
                    // with all windows), so we must route it according to event.source
                    (globalThis as unknown as WindowLike).addEventListener(
                        "message",
                        (event: unknown) => {
                            /* eslint-disable @typescript-eslint/no-explicit-any */
                            if (
                                event &&
                                (event as any).source === ownerWindow
                            ) {
                                handler(event);
                            }
                            /* eslint-enable @typescript-eslint/no-explicit-any */
                        },
                        { signal },
                    );
                },
                (message: WxMessage) => {
                    ownerWindow.postMessage(message, ownerOrigin);
                },
            );
            if (controller.err) {
                return controller;
            }

            const { start, close, isClosed, onClose } = controller.val;

            // close the connection when this window is closed
            (globalThis as unknown as WindowLike).addEventListener(
                "pagehide",
                () => {
                    close();
                },
            );
            // when connection is closed, send close message to the other end
            void onClose(() => {
                ownerWindow.postMessage(
                    {
                        s: wxInternalProtocol,
                        p: wxInternalProtocol,
                        m: 1,
                        f: wxFuncClose,
                        d: "close",
                    },
                    ownerOrigin,
                );
            });

            await start();

            const end: WxEnd = {
                send: (message) => {
                    if (isClosed()) {
                        return { err: { code: "Closed" } };
                    }
                    ownerWindow.postMessage(message, ownerOrigin);
                    return {};
                },
                close,
                onClose,
                isClosed,
            };

            return { val: end };
        },
    });
};

/** Helper to link to a Window object */
const linkToTargetWindow = (
    selfOrigin: string,
    targetWindow: WindowLike,
    targetOrigin: string,
    onRecv: WxEndRecvFn,
    options?: WxEndOptions,
): Promise<WxResult<WxEnd>> => {
    // setting the global end creator for same-origin same-context linking
    // this should be fine (no race condition) because if this is doable,
    // then the other window can't possibly start execute until this function is done
    if (targetOrigin === selfOrigin) {
        return new Promise<WxResult<WxEnd>>((resolve) => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (targetWindow as any)[wxSameContextGlobalEndCreator] = (
                    onRecvB: WxEndRecvFn,
                ) => {
                    const [endA, endB] = wxMakeChannel(onRecv, onRecvB);
                    resolve({ val: endA });
                    return { val: endB };
                };
                return;
            } catch (e) {
                console.error(e);
                resolve({
                    err: wxFail(
                        "Failed to create same-context linking: " + errstr(e),
                    ),
                });
            }
        });
    }

    return linkToTargetWindowCrossOrigin(
        targetWindow,
        targetOrigin,
        onRecv,
        options,
    );
};

const linkToTargetWindowCrossOrigin = async (
    targetWindow: WindowLike,
    targetOrigin: string,
    onRecv: WxEndRecvFn,
    options?: WxEndOptions,
): Promise<WxResult<WxEnd>> => {
    const controller = wxMakeMessageController(
        false,
        options?.timeout,
        onRecv,
        (handler, signal) => {
            // messages from the target window will be posted to globalThis (shared
            // with all windows), so we must route it according to event.source
            (globalThis as unknown as WindowLike).addEventListener(
                "message",
                (event: unknown) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    if (event && (event as any).source === targetWindow) {
                        handler(event);
                    }
                },
                { signal },
            );
        },
        (message: WxMessage) => {
            targetWindow.postMessage(message, targetOrigin);
        },
    );

    if (controller.err) {
        return controller;
    }

    const { start, close, isClosed, onClose } = controller.val;
    await start();

    const end: WxEnd = {
        send: (message) => {
            if (isClosed()) {
                return { err: { code: "Closed" } };
            }
            targetWindow.postMessage(message, targetOrigin);
            return {};
        },
        close,
        onClose,
        isClosed,
    };

    return { val: end };
};
