/* eslint-disable @typescript-eslint/no-explicit-any */
import { errstr, type Result, type Err } from "./pure_result.ts";

import type {
    WorkerLike,
    WorkexClientOptions,
    WorkexInternalError,
    WorkexPromise,
    WorkexResult,
    WorkexTimeout,
} from "./types.ts";
import {
    WorkexCatchFId,
    WorkexMessage,
    WorkexReturnFId,
    isMessage,
} from "./utils.ts";
import { bindHost, type Handshake } from "./bind.ts";

function makeMessageIdGenerator() {
    let nextId = MIN_MID;
    return () => {
        if (nextId >= MAX_MID) {
            nextId = MIN_MID;
        }
        return nextId++;
    };
}

// start at 100 to avoid conflict with internal message ids
const MIN_MID = 100;
const MAX_MID = 500000;

export class WorkexClient<TProto extends string> {
    private options: WorkexClientOptions;
    private protocol: TProto;
    private worker: WorkerLike;
    private nextMessageId: () => number;
    private pending: Map<number, (value: any) => void>;
    private timeout: number;

    private stopped: boolean;

    constructor(protocol: TProto, options: WorkexClientOptions) {
        this.options = options;
        this.worker = options.worker;
        this.nextMessageId = options.nextMessageId || makeMessageIdGenerator();
        this.pending = new Map();
        this.timeout = options.timeout || 0;
        if (this.timeout < 0) {
            this.timeout = 0;
        }
        this.protocol = protocol;
        this.stopped = false;

        const responseHandler = ({ data }: { data: unknown }) => {
            if (this.stopped) {
                return;
            }
            if (!isMessage(this.protocol, data)) {
                return;
            }

            const { p: _, m: mId, f: fId, d: workexresult } = data;
            // only handle response fIds
            if (fId !== WorkexReturnFId && fId !== WorkexCatchFId) {
                return;
            }
            // invalid message id? probably fine to ignore?
            const resolve = this.pending.get(mId);
            if (!resolve) {
                globalThis.console.warn(
                    "No resolve function for message id",
                    mId,
                );
                return;
            }

            try {
                this.pending.delete(mId);

                if (fId === WorkexReturnFId) {
                    resolve(workexresult);
                } else {
                    resolve({
                        err: { type: "Catch", message: errstr(workexresult) },
                    });
                }
            } catch (e) {
                globalThis.console.error(e);
                resolve({ err: { type: "InternalError", message: errstr(e) } });
            }
        };

        if (!options.assign && this.worker.addEventListener) {
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
                    return {
                        err: {
                            type: "Internal",
                            message: "No available message id",
                        },
                    };
                }
            }
        }
        return { val: mId };
    }

    public post<T>(fId: number, args: any[]): WorkexPromise<T> {
        if (this.stopped) {
            return Promise.resolve({
                err: { type: "Catch", message: "Terminated" },
            });
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
                    d: args,
                } satisfies WorkexMessage<TProto>);
            });
            if (!this.timeout) {
                return promise as WorkexPromise<T>;
            }
            const timeoutPromise = new Promise<Err<WorkexTimeout>>(
                (resolve) => {
                    setTimeout(() => {
                        resolve({ err: { type: "Catch", message: "Timeout" } });
                    }, this.timeout);
                },
            );
            return Promise.race([promise, timeoutPromise]) as WorkexPromise<T>;
        } catch (e) {
            return Promise.resolve({
                err: { type: "Internal", message: errstr(e) },
            });
        }
    }

    public async postVoid(fId: number, args: any[]): WorkexPromise<void> {
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

    /**
     * Create a client-side handshake
     *
     * The host-side should initiate the handshake,
     * and the client side can await on the `established` method
     */
    public handshake(): Handshake {
        return bindHost(this.protocol, this.options, () => undefined);
    }
}
