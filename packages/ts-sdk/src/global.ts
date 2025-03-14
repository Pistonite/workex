/**
 * Dynamically get the global instances and environments
 * that we need, without depending on TSlib
 */

export type ConsoleLike = {
    error: (...x: unknown[]) => void;
    warn: (...x: unknown[]) => void;
};

export const globalConsole = (): ConsoleLike => {
    if ("console" in globalThis) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (globalThis as any).console as ConsoleLike;
    }
    return {
        error: () => {},
        warn: () => {},
    };
};
