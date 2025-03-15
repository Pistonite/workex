import { WxEnd } from "./WxEnd.ts";

export const wxInternalProtocol = "workex" as const;
export const wxFuncHello = 2 as const;
export const wxFuncClose = 3 as const;

/**
 * Payload sendable to a {@link WxEnd}
 */
export type WxPayload = {
    /**
     * The protocol identifier. Listeners on the other side
     * maybe use this identifier to choose if they should handle or ignore
     * the payload
     * 
     * The protocol "workex" is reserved for internal communication
     */
    p: string,

    /** 
     * Message identifier.
     * 
     * This is a serial number generated per RPC call to route the returned
     * response to the promise that is waiting for it.
     * 
     * Messages 0-99 are reserved for internal use. Regular RPC calls
     * will start from 100
     */
    m: number,

    /**
     * Function identifier.
     * 
     * This is a unique identifier inside the protocol that identifies
     * the function that is being called by RPC. For response messages,
     * this indicates if the response is a return (0) or catch (1)
     * 
     * Functions 0-31 are reserved for internal use in workex library
     */
    f: number,

    /**
     * Data payload.
     * 
     * This is anything transferrable by the underlying messaging channel.
     * For example, for Workers, this is any transferreable object. For web requests,
     * this should probably be something seraializable to JSON.
     */
    d: unknown
}

/**
 * Message object with the `s` field set to "workex" to not be confused with messages
 * with other libraries
 */
export type WxMessage = WxPayload & {s: typeof wxInternalProtocol};

export const isWxMessageEvent = (event: unknown): event is { data: WxPayload } => {
    if (!event) {
        return false;
    }
    const data = (event as any).data;
    if (!data || data.s !== "workex") {
        return false;
    }

    if (!data.p) {
        return false;
    }

    return typeof data.m === "number" &&
        typeof data.f === "number" &&
        "d" in data;
}
