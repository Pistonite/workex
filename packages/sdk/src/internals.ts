/**
 * Internal implementation details
 *
 * Consumer should only import from `@pistonite/workex`, which re-exports all public APIs and types.
 * Importing from `@pistonite/workex/internals` is considered unstable.
 *
 * See {@link public}.
 *
 * @module
 */
export { wxFail } from "./wx_error.ts";
export type { WindowLike, IFrameLike, WorkerLike } from "./wx_util.ts";

export type { WxEnd, WxEndOptions } from "./wx_end.ts";
export { wxMakeWorkerEnd, wxMakeWorkerGlobalEnd, wxMakeChannel } from "./wx_end.ts";

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

export { wxWindow } from "./wx_window.ts";
