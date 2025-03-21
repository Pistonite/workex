import { wxWrapHandler, wxWorker } from "@pistonite/workex";

// this imports the generated code
import { testappWorkerSide } from "./interfaces/WorkerSide.bus.ts";
// this imports the original input interface
import type { AppSide } from "./Interfaces.ts";

// we will wrap the code in an async main function
// to avoid issues with top-level await in older browsers
// and be able to use early returns
const main = async () => {
    console.log("App: start");
    // define the handler on app side that responds
    // to calls from the worker
    const handler: AppSide = {
        getData: wxWrapHandler((id: string) => {
            if (id === "foo") {
                return "bar";
            }
            return "";
        })
    }

    console.log("App: creating worker");
    // create the worker
    // here we assume the bundled worker JS file will be served
    // as /worker.js
    const worker = new Worker("/worker.js");

    console.log("App: connectiong to worker");
    // because WorkerSide and AppSide are linked,
    // testappWorkerSide takes in an AppSide handler
    // and returns a WorkerSide interface
    const result = await wxWorker(worker)({
        workerApi: testappWorkerSide(handler)
    });

    // handle error in initialization of the connection
    if (result.err) {
        console.error("App got error:", result.err);
        // note if the connection fails, the worker will be terminated
        // automatically
        return;
    }
    console.log("App: worker connected!");
    // initialize the worker side
    // the `workerApi` name is derived from the wxWorker call
    // above, and is type-checked
    const { connection, protocols: { workerApi }} = result.val;

    console.log("App: calling worker.initialize()");
    // call the initialize() function defined on the WorkerSide
    // interface
    const ready = await workerApi.initialize();
    // Any RPC call would return WxResult<T>, and you must
    // handle the potential errors that happen during
    // communication
    if (ready.err) {
        console.error("App got error:", ready.err);
        // after connection is established, errors don't close
        // the connection. you can manually close the connection
        // with connection.close() or worker.terminate()
        connection.close();
        return;
    }

    console.log("App: calling worker.process()");

    // do some work!
    const output = await workerApi.process("hello foo");
    console.log("App: got response from worker:", output);
}

// call our main function
void main();

