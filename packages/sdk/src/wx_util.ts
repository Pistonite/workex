import { makePromise, type PromiseHandle } from "@pistonite/pure/sync";

import type { WxPromise } from "./wx_error.ts";

/** Wrapper for different parts of a single promise. See {@link wxMakePromise} */
export type WxPromiseWrapper<T> = PromiseHandle<T>;

/**
 * Simple utility for making a promise and getting its resolve and reject functions.
 */
export const wxMakePromise: <T>() => WxPromiseWrapper<T> = makePromise;

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

/**
 * Things that looks like a `Worker`
 * @ignore
 */
export interface WorkerLike {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    postMessage: (message: any) => any;
    addEventListener: (
        type: string,
        listener: (event: any) => any,
        options?: { signal?: any },
    ) => any;
    terminate?: (() => void) | null;
    /* eslint-enable @typescript-eslint/no-explicit-any */
}

/** @ignore */
export interface IFrameLike {
    src: string;
    contentWindow?: WindowLike | null;
}

/**
 * Things that looks like a `Window`
 * @ignore
 */
export interface WindowLike {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    postMessage: (message: any, targetOrigin: string) => any;
    addEventListener: (
        type: string,
        listener: (event: any) => any,
        options?: { signal?: any },
    ) => any;
    opener?: WindowLike | null;
    parent?: WindowLike | null;
    location?: {
        origin?: string;
    };
    open: (url: string, target: string, features: string) => WindowLike | null;
    close?: () => void;
    closed?: boolean;
    /* eslint-enable @typescript-eslint/no-explicit-any */
}
