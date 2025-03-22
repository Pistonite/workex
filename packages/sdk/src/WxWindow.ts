import { once } from "@pistonite/pure/sync";
import { errstr } from "@pistonite/pure/result";

import {
    wxMakeChannel,
    type WxEnd,
    type WxEndOptions,
    type WxEndRecvFn,
    wxMakeEnd,
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
        options?: { signal?: unknown },
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
    contentWindow: WindowLike;
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
     * Open a Popup window and create a {@link WxEnd} for messaging to that window
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
    /**
     * Callback to be invoked when the popup is closed.
     *
     * The popup can be closed in one of the following ways:
     * - The user closes the popup window
     * - The user closes the main window (in which case the popup will be closed automatically)
     * - Underlying connection is closed by either end
     */
    onClose?: () => void;
};

/**
 * Options for linking to an iframe. See {@link wxFrame}
 */
export type WxFrameLinkOptions = WxEndOptions & {
    /** Decides what to do when close() is called from within the frame */
    onClose?: () => void;
};

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

    // prepare owner for linking
    let owner: WxWindow["owner"];
    const opener = (globalThis as unknown as WindowLike).opener;
    const parent = (globalThis as unknown as WindowLike).parent;
    const selfOrigin = (globalThis as unknown as WindowLike).location?.origin;
    if (!selfOrigin) {
        return {
            err: {
                code: "NoOriginForWindow",
            },
        };
    }
    if (parent) {
        owner = createOwnerFnFor(parent, selfOrigin);
    } else if (opener) {
        owner = createOwnerFnFor(opener, selfOrigin);
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

        // handle interaction with the popup window:
        // - when main window is closed, popup should also be closed
        // - when popup is closed, close the connection
        // - when the connection is closed, close the popup

        const onClose = options?.onClose;
        if (onClose) {
            targetWindow.addEventListener("pagehide", onClose);
        }

        const close = () => {
            if (!targetWindow || targetWindow.closed) {
                return;
            }
            targetWindow.close?.();
        };

        return await linkToTargetWindow(
            selfOrigin,
            targetWindow,
            targetOrigin,
            onRecv,
            close,
            options,
        );
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

        const onClose = options?.onClose;
        return await linkToTargetWindow(
            selfOrigin,
            iframe.contentWindow,
            targetOrigin,
            onRecv,
            onClose ?? (() => {}),
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
                            if ("val" in end || "err" in end) {
                                return end;
                            }
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }
                console.warn(
                    "[workex] same-origin same-context linking failed, falling back to postMessage",
                );
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

            const { start, isClosed } = controller.val;
            await start();

            const end = wxMakeEnd(
                (message) => ownerWindow.postMessage(message, ownerOrigin),
                () => {
                    // try let the other side close us
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
                },
                isClosed,
            );
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
    close: () => void,
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
                    const originalClose = endA.close;
                    endA.close = () => {
                        originalClose();
                        close();
                    };
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
        close,
        options,
    );
};

const linkToTargetWindowCrossOrigin = async (
    targetWindow: WindowLike,
    targetOrigin: string,
    onRecv: WxEndRecvFn,
    closeWindow: () => void,
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

    const { start, close: closeController, isClosed } = controller.val;
    await start();

    const end = wxMakeEnd(
        (mesasge) => targetWindow.postMessage(mesasge, targetOrigin),
        () => {
            closeController();
            closeWindow();
        },
        isClosed,
    );

    return { val: end };
};
