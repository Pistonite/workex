import type { Err, Ok, Result, Void, VoidOk } from "@pistonite/pure/result";

/** Workex Error Codes */
export type Wec = 
    /** Generic Failure */
    "Fail"
    /** Failed to add event listener*/
    | "AddEventListenerFail"
    /** Timeout while waiting for response */
    | "Timeout"
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
    /** If the other end does not agree with the protocols used by this end */
    | "ProtocolDisagree"
    /** If the other end closed unexpectedly */
    | "Closed"
    /** If a message received has a protocol not registered on the bus */
    | "UnknownProtocol"
    /** An error is caught at the bus level in the handler on the other end */
    | "Catch"
    /** If multiple connection of the same protocol are configured on the same bus */
    | "DuplicateProtocol"
    /** The data field in a request is invalid */
    | "InvalidRequestData"
    /** Calling the other side with a bad function id */
    | "UnknownFunction"
    /** The handler did not return anything */
    | "NoReturn"
    /** The stub handler in a one-direction protocol is being called unexpectedly */
    | "UnexpectedStubCall"
    
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
