import type { WxEnd, WxEndRecvFn } from "./WxEnd.ts";
import { WxResult } from "./WxError.ts";

export type WxCreateFn = <T>(busConfig: T) => WxBus<T>;

const makeBus = <THost>(protocol: string, host: THost) => {
}

const create = async (endCreator: (onRecv: WxEndRecvFn) => Promise<WxResult<WxEnd>>, config: any) => {
    // create onRecv from config
    const configKvs = Object.entries(config);


    const onRecv = () => {};

    // create the end, which establishes connection
    const end = await endCreator(onRecv);
    if (end.err) {
        return end;
    }
}


// import { WorkexReturnFId } from "../utils";
//
// const api = {
//     ...
// } satisfies Extension
//
// const result = await wxWorkerGlobal(options)({
//     // here multiple workex generated buses can be added
//     app: makeExtensionBus(api),
// }, wxWorkerGlobalEnd);
// const { app } = result.val;
//
// ;
//
//
//
// // app side
//
// const worker = new Worker();
// const app = {
//
// } satisfies ExtensionApp;
// const { extension } = await wxWorker(worker, options)({
//     extension: makeExtensionAppBus(app),
// });
//
// // window...
//
// const wxw = wxWindow().val;
// const result = await wxPopup(url, options)({
//     extension: makeExtensionAppBus(app),
// })
//
// // popup...
//
// const wxw = wxWindow().val;
// const result = await wxOwnerWindow(options)({
//     app: makeExtensionBus(api),
// })
