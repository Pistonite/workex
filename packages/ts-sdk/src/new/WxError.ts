import type { Err, Ok, Result, Void, VoidOk } from "@pistonite/pure/result";

/** Workex Error Codes */
export type Wec = 
    /** Generic Failure */
    "Fail"
    /** Timeout during initial handshake */
    | "HandshakeTimeout"
    /** Function should only be called when globalThis is WorkerGlobalScope */
    | "NotWorkerGlobalScope"
    /** Function should only be called when globalThis is Window */
    | "NotWindow"
    /** WxWindow.owner is called on a Window that doesn't have an owner (i.e. not an iframe or popup opened by another window) */
    | "NoOwnerForWindow"
    /** When wxWindow cannot read globalThis.location.origin */
    | "NoOriginForWindow"
    /** Failed to parse URL, for example when opening a popup or parsing src of iframe */
    | "InvalidUrl"
    
    ;

/** Workex Error object, containing an error code and optionally a message */
export type WxError = {
    code: Wec,
    message?: string
}

export const wxFail = (message: string): WxError => ({
    code: "Fail",
    message
});

export type WxResult<T> = Result<T, WxError>;
export type WxVoid = Void<WxError>;

/** Promise type wrapper, mainly to make it easier for codegen to produce types */
export type WxPromise<T> = Promise<
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    (T extends void ? VoidOk : Ok<T>) | Err<WxError>
>;