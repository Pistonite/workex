/**
 * Global environment to run workex.
 *
 * If consumer of workex library is does not configure their TSLibs correctly
 * in tsconfig.json, they will get errors when running TSC.
 *
 * This basically prevents clients from running workex in unsupported environments.
 */

declare const console: {
    info: (...x: unknown[]) => void;
    debug: (...x: unknown[]) => void;
    error: (...x: unknown[]) => void;
    warn: (...x: unknown[]) => void;
};

declare const setTimeout: (fn: () => void, ms: number) => number;
declare const clearTimeout: (id: number) => void;

declare type AbortController = {
    signal: AbortSignal;
    abort: () => void;
};
declare const AbortController: {
    new (): AbortController;
};

declare type AbortSignal = unknown;

declare const URL: {
    new (url: string): {
        origin: string;
    };
};
