import type { WxPromise } from "@pistonite/workex";

export interface SideA {
    logMessage(message: string): WxPromise<void>;
}

export interface SideB {
    logMessage(message: string): WxPromise<void>;
}
