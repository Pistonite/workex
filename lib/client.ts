/* eslint-disable @typescript-eslint/no-explicit-any */
import { errstr, type Result, type Err } from "@pistonite/pure/result";

import type { WorkerLike, WorkexClientOptions, WorkexInternalError, WorkexPromise, WorkexResult, WorkexTimeout } from "./types.ts";
import { WorkexMessage, WorkexReturnFId, isMessage } from "./utils.ts";

function makeMessageIdGenerator() {
    let nextId = 0;
    return () => {
        if (nextId >= MAX_MID) {
            nextId = 0;
        }
        return nextId++;
    }
}

const MAX_MID = 500000;

export class WorkexClient<TProto extends string, TFId extends number> {
    private protocol: TProto;
    private worker: WorkerLike;
    private nextMessageId: () => number;
    private pending: Map<number, (value: any) => void>;
    private timeout: number;

    private stopped: boolean;

    constructor(protocol: TProto, options: WorkexClientOptions) {
        this.worker = options.worker;
        this.nextMessageId = options.nextMessageId || makeMessageIdGenerator();
        this.pending = new Map();
        this.timeout = options.timeout || 0;
        if (this.timeout < 0) {
            this.timeout = 0;
        }
        this.protocol = protocol;
        this.stopped = false;

        const responseHandler = ({data}: {data: unknown}) => {
            if (this.stopped) {
                return;
            }
            if (!isMessage(this.protocol, data)) {
                return;
            }

            const { p: _, m: mId, f: fId, d: result } = data;

            const resolve = this.pending.get(mId);
            if (!resolve) {
                return;
            }
            try {
                this.pending.delete(mId);

                if (fId === WorkexReturnFId) {
                    resolve({ val: result });
                } else {
                    resolve({ err: { type: "Catch", message: errstr(result) } });
                }
            } catch (e) {
                resolve({ err: { type: "InternalError", message: errstr(e) } });
            }
        };

        if (options.useAddEventListener && this.worker.addEventListener) {
            this.worker.addEventListener("message", responseHandler);
        } else {
            this.worker.onmessage = responseHandler;
        }
    }

    private nextMId(): Result<number, WorkexInternalError> {
        const nextMessageId = this.nextMessageId;
        let mId = nextMessageId();
        if (this.pending.has(mId)) {
            let initialMId = mId;
            while (this.pending.has(mId)) {
                mId = nextMessageId();
                if (mId === initialMId) {
                    return { err: {
                        type: "InternalError",
                        message: "No available message id"
                    } };
                }
            }
        }
        return { val: mId };
    }

    public post<T>(fId: TFId, args: any[]): WorkexPromise<T> {
        if (this.stopped) {
            return Promise.resolve({ err: { type: "Catch", message: "Terminated" } });
        }
        try {
            const mId = this.nextMId();
            if (mId.err) {
                return Promise.resolve(mId);
            }
            const promise = new Promise<WorkexResult<T>>((resolve) => {
                this.pending.set(mId.val, resolve);
                this.worker.postMessage({
                    p: this.protocol, 
                    m: mId.val, 
                    f: fId, 
                    d: args
                } satisfies WorkexMessage<TProto>);
            });
            if (!this.timeout) {
                return promise as WorkexPromise<T>;
            }
            const timeoutPromise = new Promise<Err<WorkexTimeout>>((resolve) => {
                setTimeout(() => {
                    resolve({ err: { type: "Catch", message: "Timeout" }});
                }, this.timeout);
            });
            return Promise.race([promise, timeoutPromise]) as WorkexPromise<T>;
        } catch (e) {
            return Promise.resolve({ err: { type: "InternalError", message: errstr(e) } });
        }
    }

    public async postVoid(fId: TFId, args: any[]): WorkexPromise<void> {
        const res = await this.post(fId, args);
        if (res.err) {
            return res;
        }
        return {};
    }

    public terminate() {
        this.stopped = true;
        if (this.worker.terminate) {
            this.worker.terminate();
        }
    }

}
