/**
 * Internal utilities for workex
 */

// 0-15 are reserved function IDs for workex

/** FId for a return value for success */
export const WorkexReturnFId = 0 as const;
/** FId for a return value for catch */
export const WorkexCatchFId = 1 as const;

export const WorkexHandshakeFId = 2 as const;

/** A message sent between the worker and the host */
export type WorkexMessage<TProto extends string> = {
    /** Protocol identifier, in case multiple workex-generated protocols are being used */
    p: TProto;
    /** Message identifier */
    m: number;
    /** Function identifier */
    f: number;
    /**
     * Data to be sent
     *
     * For calling function, this is the argument list.
     *
     * For return value, this is the raw WorkexResult
     * For catch value, this is the error message
     */
    d: unknown;
};

/** Check if the data is a WorkexMessage */
export function isMessage<TProto extends string>(
    protocol: TProto,
    data: unknown,
): data is WorkexMessage<TProto> {
    return (
        !!data &&
        typeof data === "object" &&
        "p" in data &&
        "m" in data &&
        "f" in data &&
        "d" in data &&
        data.p === protocol
    );
}
