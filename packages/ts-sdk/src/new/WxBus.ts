import { WorkexReturnFId } from "../utils";

const api = {
    ...
} satisfies Extension

const result = await wxWorkerGlobal(options)({
    // here multiple workex generated buses can be added
    app: makeExtensionBus(api),
}, wxWorkerGlobalEnd);
const { app } = result.val;

;



// app side

const worker = new Worker();
const app = {

} satisfies ExtensionApp;
const { extension } = await wxWorker(worker, options)({
    extension: makeExtensionAppBus(app),
});

// window...

const wxw = wxWindow().val;
const result = await wxPopup(url, options)({
    extension: makeExtensionAppBus(app),
})

// popup...

const wxw = wxWindow().val;
const result = await wxOwnerWindow(options)({
    app: makeExtensionBus(api),
})