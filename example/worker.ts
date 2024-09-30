// file: exmaple/worker.ts
import { hostFromDelegate, type Delegate } from "./workex";
import { bindWorkerMsgHandlerHost } from "./WorkerMsgHandler.recv.ts";
import { AppMsgHandlerClient } from "./AppMsgHandler.send.ts";
import type { WorkerMsgHandler } from "./proto.ts";

// helper function to help us distinguish between app and worker logs
function print(msg: any) {
  console.log("worker: " + msg);
}

// do some initialization
// ... not shown here
print("started");

async function someExpensiveWork(): Promise<string> {
  // do some expensive work
  let now = Date.now();
  while (Date.now() - now < 2000) {
    // do nothing
  }
  return "Hello from worker!";
}

// flag to check if app has called back saying it's ready
let isAppReady = false;

// Create the handler to handle the messages sent by app
//
// Using the `Delegate` type, each function here returns a regular
// Promise instead of WorkexPromise. Then later we use `hostFromDelegate`
// to wrap the result of each function as WorkexPromise

// Note that making a class and `new`-ing it will not work
// because how hostFromDelegate is implemented
const handler = {
  async readyCallback(): Promise<void> {
    print("received ready callback from app");
    isAppReady = true;
  },
  doWork(): Promise<string> {
    print("received doWork request from app");
    const result = someExpensiveWork();
    print("work done!");
    return result;
  },
} satisfies Delegate<WorkerMsgHandler>;

const options = {
  worker: self,
  useAddEventListener: true,
};

// Now we bind the handler to the worker
bindWorkerMsgHandlerHost(hostFromDelegate(handler), options);

// Create the client that will be used to send messages to the app
const client = new AppMsgHandlerClient(options);

print("initialized");

// tell the app we are ready
async function main() {
  // According to https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Introducing_workers,
  // Workers are started as soon as they are created.
  // So we have this handshake process to ensure we don't miss the ready call
  // In my testing in both Chrome and Firefox however, the worker does not start
  // until the current task is finished, but I cannot find any specification/documentation
  // that guarantees that
  let attempt = 0;
  while (!isAppReady) {
    attempt++;
    print("telling app we are ready (attempt " + attempt + ")");
    // we cannot await here, because we might be calling
    // before the app registers the handler,
    // in which case we will be stuck forever
    client.ready();
    // try again after 50ms
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
main();
