/**
 * The public APIs of the library.
 *
 * @module public
 */

// creator functions
export {
    wxWorker,
    wxWorkerGlobal,
    wxPopup,
    wxFrame,
    wxWindowOwner,
} from "./WxCreate.ts";
export type { WxWorkerCreateOptions } from "./WxCreate.ts";

// types used in public APIs
export type {
    WxProtocolConfig,
    WxProtocolBindConfig,
    WxBusRecvHandler,
    WxProtocolOutput,
    WxBusCreator,
    WxProtocolBoundSender,
} from "./WxBus.ts";
export type {
    WxFrameLinkOptions,
    WxWindowOpenOptions,
    WxWindow,
} from "./WxWindow.ts";

export type { WxEc, WxError, WxResult, WxVoid, WxPromise } from "./WxError.ts";

export type { WxPromiseWrapper } from "./WxUtil.ts";
export { wxMakePromise, wxWrapHandler } from "./WxUtil.ts";
