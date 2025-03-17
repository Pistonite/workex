import { WxBusRecvHandler, WxProtocolBindConfig } from "./WxBus.ts";

/** 
 * A stub interface that can be used as placeholders
 * when creating 1-sided communication
 */
export type WxStub = Record<string, never>;

/** 
 * Create a stub receiver implementation that always returns "UnknownFunction" error
 */
export const wxStubRecvImpl = (_handler: unknown): WxBusRecvHandler => {
    return () => {
        return Promise.resolve({ err: { code: "UnknownFunction" } });
    }
}

export const wxStubSendImpl = (_sender: unknown): WxStub => {
    return {};
}
