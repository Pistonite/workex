/**
 * Internal utilities for workex
 */

import { Err } from "@pistonite/pure/result";
import { WorkexCatch } from "./types.ts";

/** FId for a return value for success */
export const WorkexReturnFId = 0 as const;
/** FId for a return value for catch */
export const WorkexCatchFId = -1 as const;

/** A message sent between the worker and the host */
export type WorkexMessage<TProto extends string> = {
    /** Protocol identifier, in case multiple workex-generated protocols are being used */
    p: TProto;
    /** Message identifier */
    m: number;
    /** Function identifier */
    f: number;
    /** Data to be sent */
    d: unknown;
};

/** Check if the data is a WorkexMessage */
export function isMessage<TProto extends string>(protocol: TProto, data: unknown): data is WorkexMessage<TProto> {
    return !!data && typeof data === 'object' && 'p' in data && 'm' in data && 'f' in data && 'd' in data && data.p === protocol;
}

export function unhandled(fid: number): Promise<Err<WorkexCatch>> {
    return Promise.resolve({ err: { type: "Catch", message: "Unhandled: "+ fid } });
}
