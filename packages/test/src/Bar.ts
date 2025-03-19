
import { WxPromise as Promise2 } from "@pistonite/workex";
import type {Test} from "../src/Test";
export interface Bar {
    /** 
     * buz
     */
    doSomething(a: Test, c?: number | undefined): Promise2<string>;
}

