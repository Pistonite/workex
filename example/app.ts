// file: example/app.ts
import { hostFromDelegate, type Delegate, type WorkexResult } from "./workex";
import { bindAppMsgHandlerHost } from "./AppMsgHandler.recv.ts";
import { WorkerMsgHandlerClient } from "./WorkerMsgHandler.send.ts";
import type { AppMsgHandler } from "./proto.ts";

// helper function to help us distinguish between app and worker logs
function print(msg: any) {
  console.log("app: " + msg);
}

export async function createWorker(): Promise<WorkerMsgHandlerClient> {
  print("Creating worker");
  const worker = new Worker("/dist/worker.js"); // your worker file
  const options = {
    worker,
    useAddEventListener: true,
  };
  const client = new WorkerMsgHandlerClient(options);
  // after creation, the worker will start executing right away in a separate thread
  // so we need to know when it's ready
  await new Promise<void>((resolve) => {
    const handler = {
      async ready(): Promise<void> {
        print("received ready from worker");
        // tell worker we know it's ready
        // we can await here, because when worker calls ready,
        // it has already registered the handler
        await client.readyCallback();
        resolve();
      },
    } satisfies Delegate<AppMsgHandler>;
    bindAppMsgHandlerHost(hostFromDelegate(handler), options);
    print("handlers all set up on app side");
  });
  print("worker ready");

  // at this point, we have completed the handshake, and both sides are ready
  // to communicate
  return client;
}

async function main() {
  print("starting");
  const worker = await createWorker();

  const result: WorkexResult<string> = await worker.doWork();
  if (result.val) {
    print("worker returned:" + result.val);
  } else {
    console.error(result.err);
  }

  // cleanup
  print("terminating worker");
  worker.terminate();
}

main();
