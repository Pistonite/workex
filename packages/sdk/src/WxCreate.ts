import {
    type WxBusCreator,
    wxCreateBus,
    type WxProtocolConfig,
} from "./WxBus.ts";
import {
    type WorkerLike,
    wxMakeWorkerEnd,
    wxMakeWorkerGlobalEnd,
} from "./WxEnd.ts";
import {
    type IFrameLike,
    type WxFrameLinkOptions,
    wxWindow,
    type WxWindowOpenOptions,
} from "./WxWindow.ts";

/**
 * Options to create Worker connections, using {@link wxWorker} or {@link wxWorkerGlobal}.
 */
export type WxWorkerCreateOptions = {
    /** Timeout for initialization and messaging, default is 60s */
    timeout?: number;
};

/**
 * Create connection to a Worker. The worker should connect to this end using
 * {@link wxWorkerGlobal}.
 */
export const wxWorker = (
    worker: WorkerLike,
    options?: WxWorkerCreateOptions,
): WxBusCreator => {
    return <TConfig extends WxProtocolConfig>(config: TConfig) => {
        return wxCreateBus(
            false /* passive side */,
            (onRecv) => {
                return wxMakeWorkerEnd(worker, onRecv, options);
            },
            config,
            options?.timeout,
        );
    };
};

/**
 * Create connection using the `WorkerGlobalScope`, which connects to the thread that created
 * this worker using {@link wxWorker}.
 *
 * This will fail if called when `globalThis` is not a `WorkerGlobalScope`.
 */
export const wxWorkerGlobal = (
    options?: WxWorkerCreateOptions,
): WxBusCreator => {
    return <TConfig extends WxProtocolConfig>(config: TConfig) => {
        return wxCreateBus(
            true /* active side */,
            (onRecv) => {
                return wxMakeWorkerGlobalEnd(onRecv, options);
            },
            config,
            options?.timeout,
        );
    };
};

/**
 * Open the url in the popup window, and create a connection to it.
 * Same-origin and cross-origin are both supported and the differences
 * are handled internally.
 *
 * The other end should connect to this window using {@link wxWindowOwner}.
 *
 * This will fail if called when `globalThis` is not a `Window`.
 */
export const wxPopup = (
    url: string,
    options?: WxWindowOpenOptions,
): WxBusCreator => {
    return <TConfig extends WxProtocolConfig>(config: TConfig) => {
        return wxCreateBus(
            false /* passive side */,
            async (onRecv) => {
                const wxw = wxWindow();
                if (wxw.err) {
                    return wxw;
                }
                return await wxw.val.popup(url, onRecv, options);
            },
            config,
            options?.timeout,
        );
    };
};

/**
 * Create connection with an iframe element. Same-origin and cross-origin
 * are both supported and the differences
 * are handled internally.
 *
 * The other end should connect to this window using {@link wxWindowOwner}.
 *
 * This will fail if called when `globalThis` is not a `Window`.
 */
export const wxFrame = (
    frame: IFrameLike,
    options?: WxFrameLinkOptions,
): WxBusCreator => {
    return <TConfig extends WxProtocolConfig>(config: TConfig) => {
        return wxCreateBus(
            false /* passive side */,
            async (onRecv) => {
                const wxw = wxWindow();
                if (wxw.err) {
                    return wxw;
                }
                return await wxw.val.frame(frame, onRecv, options);
            },
            config,
            options?.timeout,
        );
    };
};

/**
 * Create connection with the owner window (i.e. the opener or embedder) that
 * used {@link wxPopup} or {@link wxFrame}.
 *
 * Since cross-origin access to Window properties is restricted, you must
 * provide the origin of the owner window.
 */
export const wxWindowOwner = (
    ownerOrigin: string,
    options?: WxWorkerCreateOptions,
): WxBusCreator => {
    return <TConfig extends WxProtocolConfig>(config: TConfig) => {
        return wxCreateBus(
            true /* active side */,
            async (onRecv) => {
                const wxw = wxWindow();
                if (wxw.err) {
                    return wxw;
                }
                return await wxw.val.owner(ownerOrigin, onRecv, options);
            },
            config,
            options?.timeout,
        );
    };
};
