import { errstr } from "@pistonite/pure/result";

import type { WorkerLike, WorkexBindOptions } from "./types.ts";
import {
    WorkexCatchFId,
    WorkexHandshakeFId,
    type WorkexMessage,
    WorkexReturnFId,
    isMessage,
} from "./utils.ts";
import { globalConsole } from "./global.ts";

/// Bind the worker to a host handler
export function bindHost<TProto extends string>(
    protocol: TProto,
    options: WorkexBindOptions,
    /// Handler to handle the request
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (fId: number, data: any[]) => Promise<any> | undefined,
): Handshake {
    const { worker } = options;

    const handshake = new HandshakeImpl(protocol, worker);

    const requestHandler = async ({ data }: { data: unknown }) => {
        if (!isMessage(protocol, data)) {
            return;
        }

        const { p: _, m: mId, f: fId, d: args } = data;

        if (fId === WorkexHandshakeFId) {
            handshake.setReady();
            return;
        }

        try {
            const workexresult = handler(fId, args as unknown[]);
            if (!workexresult) {
                return;
            }
            worker.postMessage({
                p: protocol,
                m: mId,
                f: WorkexReturnFId,
                d: await workexresult,
            } satisfies WorkexMessage<TProto>);
        } catch (e) {
            globalConsole().error(e);
            worker.postMessage({
                p: protocol,
                m: mId,
                f: WorkexCatchFId,
                d: errstr(e),
            } satisfies WorkexMessage<TProto>);
        }
    };

    if (!options.assign && worker.addEventListener) {
        worker.addEventListener("message", requestHandler);
    } else {
        worker.onmessage = requestHandler;
    }

    return handshake;
}

/**
 * Handshake maker
 *
 * One side calls await handshake.initiate() to start the handshake,
 * the other side calls await handshake.established() to wait for the handshake to be established.
 *
 * After that, normal communication can proceed.
 */
export type Handshake = {
    /** Initiate the handshake. Returns a promise that resolves when the handshake is established */
    initiate: () => Promise<void>;
    /** Returns a promise that resolves when the otherside initiates the handshade */
    established: () => Promise<void>;
};

class HandshakeImpl implements Handshake {
    protocol: string;
    worker: WorkerLike;
    // resolve for the waiting side
    resolve: (() => void) | undefined;
    // promise for either side
    promise: Promise<void> | undefined;

    // ready value for the initiating side
    isReady: boolean;

    constructor(protocol: string, worker: WorkerLike) {
        this.protocol = protocol;
        this.worker = worker;
        this.promise = undefined;
        this.resolve = undefined;
        this.isReady = false;
    }

    setReady() {
        this.isReady = true;
        if (this.resolve) {
            this.worker.postMessage({
                p: this.protocol,
                m: 1,
                d: 1,
                f: WorkexHandshakeFId,
            });
            this.resolve();
        }
    }

    initiate(): Promise<void> {
        if (this.promise) {
            return this.promise;
        }
        this.promise = this.doInitiate();
        return this.promise;
    }

    async doInitiate() {
        let count = 0;
        while (!this.isReady) {
            count++;
            this.worker.postMessage({
                p: this.protocol,
                m: 1,
                d: 1,
                f: WorkexHandshakeFId,
            });
            // Slow down after 10 tries to avoid high CPU
            await new Promise((resolve) =>
                setTimeout(resolve, count > 100 ? 2000 : 100),
            );
            if (count === 100) {
                globalConsole().warn(
                    "[workex] initiated handshake has not estalished for 10 seconds!",
                );
            }
        }
    }

    established(): Promise<void> {
        if (this.promise) {
            return this.promise;
        }
        this.promise = new Promise((resolve) => {
            this.resolve = resolve;
        });
        return this.promise;
    }
}
