import { WorkexPromise } from "./msg/workex";
import { GreetAppClient, bindGreetWorkerHost } from "./msg/sides/worker.ts";
import type { GreetWorker } from "./msg/proto.ts";

const options = { worker: self };

// Create the client used to call back to the app
const client = new GreetAppClient(options);

// Create the handler to handle the messages sent by app
// Note that the standalone case we used Delegate,
// here we are showing how to implement the host directly
class Handler implements GreetWorker {
    async greet(): WorkexPromise<string> {
        // get the person's name from the app
        const name = await client.getName();
        // handle potential communication errors
        if (name.err) {
            return name;
        }
        // greet the person
        const greeting = `Hello, ${name.val}!`;
        // return it back to the app
        return { val: greeting };
    }
}

// similar to the standalone example, we will let the worker
// initiate the handshake
const handshake = bindGreetWorkerHost(new Handler(), options);
handshake.initiate();

