
import { WorkexPromise as Promise } from "./workex";
import type {Test} from "./Test";
export interface Bar {
    /** 
     * buz
     */
    doSomething(a: Test, c?: number | undefined): Promise<string>;
}

