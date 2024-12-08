
import { WorkexPromise as Promise } from "./workex";
export interface Bar {
    /** 
     * buz
     */
    doSomething(a: number, c?: number | undefined): Promise<string>;
}

