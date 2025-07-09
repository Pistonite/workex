/**
 * Internal implementation details
 *
 * Consumer should only import from "/", which re-exports all public APIs and types
 * See {@link public}
 */
export { wxFail } from "./wx_error.ts";

export type { WxEnd, WxEndOptions, WorkerLike } from "./wx_end.ts";
export {
    wxMakeWorkerEnd,
    wxMakeWorkerGlobalEnd,
    wxMakeChannel,
} from "./wx_end.ts";

export type {
    WxPayload,
    WxMessage,
    WxMessageController,
    WxOnRecvFn,
    AddMessageEventListenerFn,
} from "./wx_message.ts";
export {
    wxInternalProtocol,
    wxFuncReturn,
    wxFuncReturnError,
    wxFuncHandshake,
    wxHandshakeMsgHello,
    wxFuncClose,
    wxFuncProtocol,
    isWxMessageEvent,
    wxMakeMessageController,
} from "./wx_message.ts";

export type { WindowLike, IFrameLike } from "./wx_window.ts";
export { wxWindow } from "./wx_window.ts";

export { log } from "./wx_log.ts";
