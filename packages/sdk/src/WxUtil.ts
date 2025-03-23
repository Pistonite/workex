import type { WxPromise } from "./WxError.ts";

/** Wrapper for different parts of a single promise. See {@link wxMakePromise} */
export type WxPromiseWrapper<T, E = unknown> = {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason: E) => void;
};

/**
 * Simple utility for making a promise and getting its resolve and reject functions.
 */
export const wxMakePromise = <T, E = unknown>(): WxPromiseWrapper<T, E> => {
    let resolve: (value: T) => void = () => {};
    let reject: (reason: E) => void = () => {};
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

/**
 * Wrap the return type `T` of a function as a `WxPromise<T>`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const wxWrapHandler = <T extends (...args: any[]) => any>(
    handler: T,
): ((...args: Parameters<T>) => WxPromise<Awaited<ReturnType<T>>>) => {
    // try-catch is handled at the bus level
    return async (...args: Parameters<T>) => {
        const result = await handler(...args);
        // TypeScript is a bit rough here since `void` isn't technically
        // handled correctly
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { val: result } as any;
    };
};
