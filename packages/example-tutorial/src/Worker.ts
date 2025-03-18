
import { wxMakePromise, wxWorkerGlobal, type WxPromise } from "@pistonite/workex";

// this imports the generated code
import { testappAppSide } from "./interfaces/AppSide.bus.ts";
// this imports the original input interface
import type { WorkerSide, AppSide } from "./Interfaces.ts";


// we will wrap the code in an async main function
// to avoid issues with top-level await in older browsers
// and be able to use early returns
const main = async () => {
    // create the binding up here since the handler
    // needs to reference the app side, which may or may not be ready
    // when the handler is called
    const {
        promise: appApiPromise,
        resolve: resolveAppApi,
    } = wxMakePromise<AppSide>();

    // define the handler on worker side that responds
    // to calls from the app
    const handler: WorkerSide = {
        initialize: async () => {
            console.log("Worker initialized!");
            return {};
        },
        process: async (input: string): WxPromise<string> => {
            console.log("Processing input:", input);
            // wait for the binding to be set
            const app = await appApiPromise;
            // some example logic
            const data = await app.getData("foo");
            if (data.err) {
                return data;
            }
            return { val: `${input} ${data.val}` };
        }
    };

    // connect to the app side that created this worker
    const result = await wxWorkerGlobal()({
        // this function can take a second parameter,
        // for a callback to be invoked when the binding is ready.
        // If the app side calls us after the connection is established,
        // but before the binding is set on our side, the handler
        // will wait until the binding is set before continuing.
        // thanks to the promise we created at the beginning
        appApi: testappAppSide(handler, resolveAppApi)
    });

    // handle error in initialization of the connection
    if (result.err) {
        console.error(result.err);
        return;
    }
    console.log("worker is fully ready!");
}

void main();
