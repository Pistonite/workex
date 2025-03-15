// establish the connection
const connection = await linkToWorkerCreator();
// open a lane on the bridge
await connection.openHost(Interfaces.Runtime, myRuntime);
const runtimeApp = await connection.openClient<RuntimeApp>();

// --------------------------------


const worker = new Worker();
const connection = await linkToWorker(worker);

connection.onHostOpen(Symbols.host.Runtime, (host) => {
    
});
connection.onClientOpen(Interfaces.RuntimeApp, () => {
    host.register(myRuntime);
    host.register(runtimeApp);
});