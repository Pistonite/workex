import { errstr } from "pure/utils";

import type { WorkexBindOptions } from "./types.ts";
import { WorkexCatchFId, type WorkexMessage, WorkexReturnFId, isMessage } from "./utils.ts";

/// Bind the worker to a host handler
export function bindHost<TProto extends string, TFIds>(
    protocol: TProto,
    options: WorkexBindOptions,
    /// Check if the request should be handled by this handler
    shouldHandle: (fId: TFIds) => boolean,
    /// Handler to handle the request
    handler: (fId: TFIds, data: unknown) => Promise<unknown>,
): void {
    const { worker } = options;

    const requestHandler = async ({data}: {data: unknown}) => {
        if (!isMessage(protocol, data)) {
            return;
        }

        const [_, mId, fId, args] = data;
        if (!shouldHandle(fId as TFIds)) {
            return;
        }
        try {
            const result = await handler(fId as TFIds, args);
            worker.postMessage([protocol, mId, WorkexReturnFId, result] satisfies WorkexMessage<TProto>);
        } catch (e) {
            worker.postMessage([protocol, mId, WorkexCatchFId, errstr(e)] satisfies WorkexMessage<TProto>);
        }
    };

    if (options.useAddEventListener && this.worker.addEventListener) {
        this.worker.addEventListener("message", requestHandler);
    } else {
        this.worker.onmessage = requestHandler;
    }
}
