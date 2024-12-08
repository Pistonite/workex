import type { WorkerLike, WorkexPromise } from "./types.ts";

export type WorkerWithTargetOrigin = WorkerLike & {
    postMessage(message: any, targetOrigin: string): void;
};

/**
 * Create a WorkerLike that uses targetOrigin as the second argument to postMessage
 *
 * Typically, you want this if you are communicating with a `Window` object, such as a popup
 */
export const withTargetOrigin = (
    targetOrigin: string,
    worker: WorkerWithTargetOrigin,
): WorkerLike => {
    return new TargetOriginAdapter(targetOrigin, worker);
};

class TargetOriginAdapter implements WorkerLike {
    constructor(
        private targetOrigin: string,
        private worker: WorkerWithTargetOrigin,
    ) {}
    public postMessage(message: any) {
        return this.worker.postMessage(message, this.targetOrigin);
    }
    public get onmessage() {
        return this.worker.onmessage;
    }
    public set onmessage(value) {
        this.worker.onmessage = value;
    }
    public addEventListener(type: string, listener: (event: any) => any) {
        return this.worker.addEventListener?.(type, listener);
    }
    public terminate() {
        return this.worker.terminate?.();
    }
}

/** Change each function's return type from WorkexPromise to Promise */
export type Delegate<T> = {
    [key in keyof T]: DelegateFn<T[key]>;
};

/** Change the return type of a function from WorkexPromise to Promise */
export type DelegateFn<T> = T extends (...a: any) => WorkexPromise<infer U>
    ? (...a: Parameters<T>) => Promise<U>
    : never;

/** Change each function's return type from Promise to WorkexPromise */
export type WorkexAdapter<T> = {
    [key in keyof T]: WorkexAdapterFn<T[key]>;
};

/** Change the return type of a function from WorkexPromise to Promise */
export type WorkexAdapterFn<T> = T extends (...a: any) => Promise<infer U>
    ? (...a: Parameters<T>) => WorkexPromise<U>
    : never;

export const hostFromDelegate = <T extends object>(
    delegate: T,
): WorkexAdapter<T> => {
    return Object.fromEntries(
        Object.keys(delegate)
            .map((key) => {
                if (typeof (delegate as any)[key] !== "function") {
                    return undefined;
                }
                const func = ((delegate as any)[key] as any).bind(delegate);
                return [
                    key,
                    async (...args: any[]) => {
                        return { val: await func(...args) };
                    },
                ];
            })
            .filter(Boolean) as [PropertyKey, WorkexAdapterFn<any>][],
    ) as unknown as WorkexAdapter<T>;
};
