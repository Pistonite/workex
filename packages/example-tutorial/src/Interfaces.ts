import type { WxPromise } from "@pistonite/workex";

/**
 * Functions implemented by the main thread callable from the worker
 */
export interface AppSide {
    /**
     * Get some data from the main thread for the worker to process
     */
    getData(id: string): WxPromise<string>;
}

/**
 * Functions implemented by the worker callable from the main thread
 */
export interface WorkerSide {
    /**
     * Initialize the worker
     */
    initialize(): WxPromise<void>;

    /**
     * Process some data in the worker, and return the result
     */
    process(data: string): WxPromise<string>;
}
