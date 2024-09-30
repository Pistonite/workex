import { errstr } from "@pistonite/pure/result";

import type { WorkexBindOptions } from "./types.ts";
import {
  WorkexCatchFId,
  type WorkexMessage,
  WorkexReturnFId,
  isMessage,
} from "./utils.ts";

/// Bind the worker to a host handler
export function bindHost<TProto extends string>(
  protocol: TProto,
  options: WorkexBindOptions,
  /// Handler to handle the request
  handler: (fId: number, data: any[]) => Promise<any> | undefined,
): void {
  const { worker } = options;

  const requestHandler = async ({ data }: { data: unknown }) => {
    if (!isMessage(protocol, data)) {
      return;
    }

    const { p: _, m: mId, f: fId, d: args } = data;
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
      globalThis.console.error(e);
      worker.postMessage({
        p: protocol,
        m: mId,
        f: WorkexCatchFId,
        d: errstr(e),
      } satisfies WorkexMessage<TProto>);
    }
  };

  if (options.useAddEventListener && worker.addEventListener) {
    worker.addEventListener("message", requestHandler);
  } else {
    worker.onmessage = requestHandler;
  }
}
