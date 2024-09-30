//! Module comment
import { Result } from "@pistonite/pure/result";
import { WorkexPromise as Promise } from "./workex";

/**
 * My interface for testing
 */
export interface TestFoo {
    /// foo
    foo(a: number): Promise<void>;
    /* bar */
    bar(): Promise<string>;
    /// biz
    /// multi line
    biz(a: number, b: string): Promise<Result<string, number>>;
    /** 
     * buz
     */
    terminate_(a: number, b: number, c?: number): Promise<string>;
}

export interface Bar {
    /** 
     * buz
     */
    doSomething(a: number, c?: number | undefined): Promise<string>;
}

// This is not included because it is a type
export type TestBar = {
    /// foo
    foo: (a: number) => Promise<void>;
    /** bar */
    bar: () => Promise<string>;
    /// biz
    /// multi line
    biz: (a: number, b: string) => Promise<Result<string, number>>;
    /** 
     * buz
     */
    buz: (a: number, b: number, c?: number) => Promise<string>;
}
