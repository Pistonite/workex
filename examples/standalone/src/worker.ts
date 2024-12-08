// import utilities from workex
import { hostFromDelegate, type Delegate } from "./msg/workex";
// import generated types from `sides`
import { bindMyAwesomeLibHost } from "./msg/sides/worker.ts";
// import input types from the input file `proto.ts`
import type { MyAwesomeLib } from "./msg/proto.ts";

// helper function to help us distinguish between app and worker logs
function print(msg: any) {
    console.log("worker: " + msg);
}

// Do whatever initializations needed in the worker
// here we just log that the worker has started
print("started");

// function to simulate some work that takes some time
// this is synchronous, so we can demonstrate workers are on separate threads
function someExpensiveWork(): string {
    // do some expensive work
    let now = Date.now();
    while (Date.now() - now < 2000) {
        // do nothing
    }
    return "Hello from worker!";
}

// Create the handler to handle the messages sent by app
//
// Using the `Delegate` type, each function here returns a regular
// Promise instead of WorkexPromise. Then later we use `hostFromDelegate`
// to wrap the result of each function as WorkexPromise

// Note that making a class and `new`-ing it will not work
// because how hostFromDelegate is implemented
const handler = {
    async doWork(): Promise<string> {
        print("received doWork request from app");
        const result = someExpensiveWork();
        print("work done!");
        return result;
    },
} satisfies Delegate<MyAwesomeLib>;

const options = { worker: self };

// Now we bind the handler to the worker
// at this point, messages from the app can be handled
const handshake = bindMyAwesomeLibHost(hostFromDelegate(handler), options);

// we use the returned handshake object to notify the other side
// that we are ready.
handshake.initiate();

// initiate() returns a Promise that you can await on.
// If the calls can go both directions, you need to await for that
// before you can start calling the other side (which is what the app does
// in this example)
