import { useState } from 'react'
import './App.css'

// Use the vite ?worker syntax to import the module as a worker directly!
import GreetWorker from './worker.ts?worker'
import { GreetWorkerClient, bindGreetAppHost } from './msg/sides/app.ts'
import { GreetApp } from './msg/proto';
import { hostFromDelegate, type Delegate } from './msg/workex';

async function createWorker(): Promise<GreetWorkerClient> {
    // just some example data
    const names = ["Alice", "Bob", "Charlie", "David", "Eve"];
    const randomName = () => names[Math.floor(Math.random() * names.length)];

    // note this setup is very similar to what we are doing in the worker
    const worker = new GreetWorker();
    const client = new GreetWorkerClient({ worker });

    // here we use a delegate to bind the handler
    const handler = {
        async getName(): Promise<string> {
            return randomName();
        }
    } satisfies Delegate<GreetApp>;
    const handshake = bindGreetAppHost(hostFromDelegate(handler), { worker });

    // note the worker side calls initiate() and the app side
    // calls established()
    await handshake.established();

    return client;
}

// make sure you are handling the worker lifecycle correctly
// so you don't have resource leaks, especially if you need 
// to terminate() the worker
//
// here we are just using a simple global variable
const greetClient = createWorker();

function App() {
    const [message, setMessage] = useState("Press the button to greet someone!");

    return (
        <>
            <h1>Workex Example with Vite</h1>
            <div className="card">
                <button onClick={async () => {
                    const client = await greetClient;
                    const message = await client.greet();
                    if (message.val) {
                        setMessage(message.val);
                        return
                    }
                    console.error(message.err);
                }}>
                    Greet
                </button>
                <p>
                    {message}
                </p>
            </div>
        </>
    )
}

export default App
