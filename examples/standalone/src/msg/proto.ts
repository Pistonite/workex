import { WorkexPromise as Promise } from "./workex";

// in this case, the app doesn't have an API the worker
// can call. So we only need one interface (one direction).

/**
 * Functions the app can call on the worker
 *
 * @workex:send app
 * @workex:recv worker
 */
export interface MyAwesomeLib {
  /** Do some work and return the result as string */
  doWork(): Promise<string>;
}
