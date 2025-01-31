
import { WorkexPromise as Promise } from "@pistonite/workex";
import type {Test} from "../src/Test";
export interface Bar {
    /** 
     * buz
     */
    doSomething(a: Test, c?: number | undefined): Promise<string>;
}

