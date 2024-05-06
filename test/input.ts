import { Result } from "pure/result";

/**
 * My interface for testing
 */
export interface TestFoo {
    /// foo
    foo: (a: number) => Promise<void>;
    /** bar */
    bar: () => Promise<string>;
    /// biz
    biz: (a: number, b: string) => Promise<Result<string, number>>;
    /** 
     * buz
     */
    buz: (a: number, b: number, c?: number) => Promise<string>;
}
