/**
 * Internal implementation details
 *
 * Consumer should only import from "/", which re-exports all public APIs and types
 * See {@link public}
 */
export { wxFail } from "./WxError.ts";

export type { WxEnd, WxEndRecvFn, WxEndOptions, WorkerLike } from "./WxEnd.ts";
export {
    wxMakeWorkerEnd,
    wxMakeWorkerGlobalEnd,
    wxMakeChannel,
    wxMakeEnd,
} from "./WxEnd.ts";

export type {
    WxPayload,
    WxMessage,
    WxMessageController,
    AddMessageEventListenerFn,
} from "./WxMessage.ts";
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
} from "./WxMessage.ts";

export type { WindowLike, IFrameLike } from "./WxWindow.ts";
export { wxWindow } from "./WxWindow.ts";
