import type { WorkexPromise as Promise } from "workex";

/** Comments here are kept */
export interface Foo {
  /**
   * Comments here are also kept
   */
  doStuff1(): Promise<void>;
  /// Rust styles will also be kept, if you like them
  doStuff2(arg1: string, arg2: string): Promise<string>;
}
