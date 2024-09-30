import { errstr } from "@pistonite/pure/result";

import type { WorkexBindOptions } from "./types.ts";
import { WorkexCatchFId, type WorkexMessage, WorkexReturnFId, isMessage } from "./utils.ts";

/// Bind the worker to a host handler
export function bindHost<TProto extends string, TFIds>(
    protocol: TProto,
    options: WorkexBindOptions,
    /// Check if the request should be handled by this handler
    shouldHandle: (fId: TFIds) => boolean,
    /// Handler to handle the request
    handler: (fId: TFIds, data: any[]) => Promise<any>,
): void {
    const { worker } = options;

    const requestHandler = async ({data}: {data: unknown}) => {
        if (!isMessage(protocol, data)) {
            return;
        }

        const { p: _, m: mId, f: fId, d: args } = data;
        if (!shouldHandle(fId as TFIds)) {
            return;
        }
        try {
            const result = await handler(fId as TFIds, args as unknown[]);
            worker.postMessage({
                p: protocol, 
                m: mId, 
                f: WorkexReturnFId,
                d: result
            } satisfies WorkexMessage<TProto>);
        } catch (e) {
            worker.postMessage({
                p: protocol,
                m: mId,
                f: WorkexCatchFId,
                d: errstr(e)
            } satisfies WorkexMessage<TProto>);
        }
    };

    if (options.useAddEventListener && worker.addEventListener) {
        worker.addEventListener("message", requestHandler);
    } else {
        worker.onmessage = requestHandler;
    }
}
