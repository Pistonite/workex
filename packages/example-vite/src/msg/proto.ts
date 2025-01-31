import { WorkexPromise as Promise } from "@pistonite/workex";

/**
 * Functions the app can call on the worker
 *
 * @workex:send app
 * @workex:recv worker
 */
export interface GreetWorker {
    /** Ask the app for a name and greet the person! */
    greet(): Promise<string>;
}

/**
 * Functions the worker can call back to the app to get something
 *
 * @workex:send worker
 * @workex:recv app
 */
export interface GreetApp {
    /** Get the name of the person to greet */
    getName(): Promise<string>;
}
