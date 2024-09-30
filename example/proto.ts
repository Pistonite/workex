// file: example/proto.ts
import { WorkexPromise as Promise } from "./workex";

/** Messages to be handled by the App */
export interface AppMsgHandler {
  /** Signal that the worker is ready */
  ready(): Promise<void>;
}

/** Messages to be handled by the worker */
export interface WorkerMsgHandler {
  /** Confirmation that app knows we are ready */
  readyCallback(): Promise<void>;
  /** Do some work and return the result as string */
  doWork(): Promise<string>;
}
