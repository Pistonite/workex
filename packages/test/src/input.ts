//! Module comment
import { Result } from "@pistonite/pure/result";
import { WxPromise as Promise2 } from "@pistonite/workex";

/**
 * My interface for testing
 */
export interface TestFoo {
    /// foo
    foo(a: number): Promise2<void>;
    /* bar */
    bar(): Promise2<string>;
    /// biz
    /// multi line
    biz(a: number, b: string): Promise2<Result<string, number>>;
    /** 
     * buz
     */
    terminate(a: number, b: number, c?: number): Promise2<string>;
}

// /**
//  */
// export interface Bar {
//     /** 
//      * buz
//      */
//     doSomething(a: number, c?: number | undefined): Promise<string>;
// }

// This is not included because it is a type
export type TestBar = {
    /// foo
    foo: (a: number) => Promise2<void>;
    /** bar */
    bar: () => Promise2<string>;
    /// biz
    /// multi line
    biz: (a: number, b: string) => Promise<Result<string, number>>;
    /** 
     * buz
     */
    buz: (a: number, b: number, c?: number) => Promise<string>;
}
