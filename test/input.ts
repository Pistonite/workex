//! Module comment
import { Result } from "pure/result";
import { Foo as Bar } from "testtesttest";
import type { Foo2 } from "testtesttest";
import { Foo3, type Foo4 } from "testtesttest";
import exporess = require("express");

/**
 * My interface for testing
 */
export interface TestFoo {
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
