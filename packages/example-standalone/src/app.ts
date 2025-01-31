// import utilities from workex
import type { WorkexResult } from "@pistonite/workex";
// import generated types from `sides`
import { MyAwesomeLibClient } from "./msg/sides/app.ts";

// helper function to help us distinguish between app and worker logs
function print(msg: any) {
    console.log("app: " + msg);
}

export async function createWorker(): Promise<MyAwesomeLibClient> {
    print("creating worker");
    // /dist/worker.js is where the build tool puts the worker file
    const worker = new Worker("/dist/worker.js");
    const options = { worker };
    const client = new MyAwesomeLibClient(options);
    // the worker will initiate the handshake, we need to wait for
    // it to be established
    print("waiting for handshake to be established");
    await client.handshake().established();
    print("worker ready");

    // at this point, we have completed the handshake, and both sides are ready
    // to communicate
    return client;
}

async function main() {
    print("starting");
    const worker = await createWorker();

    setTimeout(() => {
        // to prove workers are on separate threads
        // log a message while the worker is synchronously
        // doing some work
        print(
            "if this message is before `work done!`, then worker is on a separate thread",
        );
    }, 1000);

    // the type is inferred. Just putting it here to be clear for you
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
