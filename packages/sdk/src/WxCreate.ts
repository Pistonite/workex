import { WxBusCreator, wxCreateBus, WxProtocolConfig } from "./WxBus";
import { WorkerLike, wxCreateWorkerEnd, wxWorkerGlobalEnd } from "./WxEnd.ts";
import { IFrameLike, WxFrameLinkOptions, wxWindow, WxWindowOpenOptions } from "./WxWindow.ts";

export type WxWorkerCreateOptions = {
    /** Timeout for initialization and messaging, default is 60s */
    timeout?: number
}

export const wxWorker = (worker: WorkerLike, options?: WxWorkerCreateOptions): WxBusCreator => {
    return <TConfig extends WxProtocolConfig>(config: TConfig) => {
        return wxCreateBus(
            false /* passive side */,
            (onRecv) => {
                return wxCreateWorkerEnd(worker, onRecv, options);
            },
            config,
            options?.timeout
        );
    }
}

export const wxWorkerGlobal = (options?: WxWorkerCreateOptions): WxBusCreator => {
    return <TConfig extends WxProtocolConfig>(config: TConfig) => {
        return wxCreateBus(
            true /* active side */,
            (onRecv) => {
                return wxWorkerGlobalEnd(onRecv, options);
            },
            config,
            options?.timeout
        );
    };
}

export const wxPopup = (url: string, options?: WxWindowOpenOptions): WxBusCreator => {
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
            options?.timeout
        );
    }
}

export const wxFrame = (frame: IFrameLike, options?: WxFrameLinkOptions): WxBusCreator => {
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
            options?.timeout
        );
    }
}

export const wxWindowOwner = (ownerOrigin: string, options?: WxWorkerCreateOptions): WxBusCreator => {
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
            options?.timeout
        );
    }
}
