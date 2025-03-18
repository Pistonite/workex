import { wxWrapHandler, wxWorker } from "@pistonite/workex";

// this imports the generated code
import { testappWorkerSide } from "./interfaces/WorkerSide.bus.ts";
// this imports the original input interface
import type { AppSide } from "./Interfaces.ts";

// we will wrap the code in an async main function
// to avoid issues with top-level await in older browsers
// and be able to use early returns
const main = async () => {
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

    // create the worker
    // here we assume the bundled worker JS file will be served
    // as /worker.js
    const worker = new Worker("/worker.js");

    // because WorkerSide and AppSide are linked,
    // testappWorkerSide takes in an AppSide handler
    // and returns a WorkerSide interface
    const result = await wxWorker(worker)({
        workerApi: testappWorkerSide(handler)
    });

    // handle error in initialization of the connection
    if (result.err) {
        console.error(result.err);
        return;
    }
    // initialize the worker side
    // the `workerApi` name is derived from the wxWorker call
    // above, and is type-checked
    const { workerApi } = result.val;
    // call the initialize() function defined on the WorkerSide
    // interface
    const ready = await workerApi.initialize();
    // Any RPC call would return WxResult<T>, and you must
    // handle the potential errors that happen during
    // communication
    if (ready.err) {
        console.error(ready.err);
        return;
    }

    // do some work!
    const output = await workerApi.process("hello foo");
    console.log(output);
}

// call our main function
void main();

