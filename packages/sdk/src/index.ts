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
} from "./wx_create.ts";
export type { WxWorkerCreateOptions } from "./wx_create.ts";

// types used in public APIs
export type { WxCloseController } from "./wx_message.ts";
export type {
    WxProtocolConfig,
    WxProtocolBindConfig,
    WxBusRecvHandler,
    WxProtocolOutput,
    WxBusCreator,
    WxProtocolBoundSender,
    WxCreateBusOutput,
} from "./wx_bus.ts";
export type {
    WxFrameLinkOptions,
    WxWindowOpenOptions,
    WxWindow,
} from "./wx_window.ts";

export type { WxEc, WxError, WxResult, WxVoid, WxPromise } from "./wx_error.ts";

export type { WxPromiseWrapper } from "./wx_util.ts";
export { wxMakePromise, wxWrapHandler } from "./wx_util.ts";

export { logLevel } from "./wx_log.ts";
