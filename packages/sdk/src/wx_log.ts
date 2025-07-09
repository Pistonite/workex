import { resettableLogger } from "@pistonite/pure/log";

const { logger, ...rest } = resettableLogger("workex", "#6F1903");
/** Logger for this library */
export const log = logger;
/** Change the logging level for log calls from this library */
export const logLevel = rest;
