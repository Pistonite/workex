# workex

Worker Exchange. The In-house messaging bindgen library for workers/windows.

See full example at the end

## Setup

This library depends on [pure](https://github.com/Pistonite/pure), the in-house TypeScript utility library.

```bash
npx jsr install @pistonite/pure
```

Then, install the bindgen tool with

```
cargo install --git https://github.com/Pistonite/workex
```

## Usage

The command line usage is

```
workex INPUT [...INPUTS] --protocol PROTOCOL --lib-path LIB_PATH
```

The `INPUTS` are TypeScript files that contain `export interface` declarations.
All exported interface will be scanned. If you want to exclude some interface,
put them in another file that's not part of the `INPUTS`.
Other exports are ignored, including:

- `export type`
- `declare`

All `import` statements will also be included in the output, no unused import analysis is done.
Note that since output is one `interface` per file, it might contain TypeScript unused import errors.
If that happens, you can:

- Separate the interfaces into different files
- Add `// @ts-ignore` to the input file (not recommended)

Some syntaxes are not supported:

- namespaces
- imports in the middle of exports
  Unsupported syntax will generate an error.

The `PROTOCOL` is any string, that will be used as the protocol identifier to filter messages
when multiple protocols are in use on the same worker object.

All interfaces involved in the protocol must be put into the same single `workex` call, because
each function call is unique in the protocol across all interfaces.

All inputs also must be in the same directory, which will also be the output directory

Finally `LIB_PATH` is where the generated workex library will be located. In your input files,
you should also import workex types from this path. It must be a relative path from the input files,
and defaults to `./workex`.

## Inputs

The input interfaces need to satisfy the following requirement:

- All members need to be regular functions (not `get` or `set`)
- Return type needs to be `WorkexPromise`, which is a `Promise<WorkexResult<T>>`
  - Typically, you can `import { WorkexPromise as Promise }` and use it as if it's a regular `Promise`
  - This type means you need to handle potential errors during the message exchange, before accessing `T`
    (which itself can be a `Result`)

For example:

```typescript
import type { WorkexPromise as Promise } from "workex";

/** Comments here are kept */
export interface Foo {
  /**
   * Comments here are also kept
   */
  doStuff1(): Promise<void>;
  /// Rust styles will also be kept, if you like them
  doStuff2(arg1: string, arg2: string): Promise<string>;
}
```

## Outputs

The outputs are:

- One `Foo.send.ts` and `Foo.recv.ts` for each `export interface Foo`
  - `send` is consumed by the side that **calls** the `Foo` interface, by using the `FooClient` class
  - `recv` is consumed by the side that **implements** the `Foo` interface, by calling `bindFooHost` function
- One `send.ts` that re-exports all `*.send.ts`
- One `recv.ts` that re-exports all `*.recv.ts`

See a full example at the end.

## Send-side Usage

On the send (i.e. calling) side, use the `FooClient` class generated per `Foo` interface.

```typescript
import { FooClient } from "my/out/dir/send.ts";

// Anything that looks like `WorkerLike` is accepted
const worker = getMyWorker();
const foo: Foo = new FooClient({
  worker,
  // if true, addEventListener will be used to add the handler
  // otherwise `onmessage` will be assigned.
  // make sure to use this if the same worker also handles other messages
  useAddEventListener: true,
});

// result will either be the return value, or a WorkexError,
// which could be an exception thrown on the other side, or an internal error
const result = await foo.doStuff1();

// When calling terminate, it will stop handling any return result and newer
// requests will return an error "Terminated"
// If `terminate` is a function on the worker (for Worker objects), it will also
// call that
foo.terminate();
```

See [types.ts](lib/types.ts) for more options available

## Recv-side Usage

On the recv side (i.e. host/implementer), use the `bindFooHost` function generated per `Foo` interface.

```typescript
import { bindFoo } from "my/out/dir/recv.ts";

// Anything that looks like `WorkerLike` is accepted
// You can use `hostFromDelegate` to make this easier.
// See the full example below
const worker = getMyWorker();
// The object that will be receiving the calls from remote
const foo: Foo = createMyFoo();

bindFoo(foo, {
  worker,
  useAddEventListener: true,
});
```

See [types.ts](lib/types.ts) for more options available

## Full Example

You can run the full example in the `example` directory! `bun` and `cargo` are required.
If you have [`task`](https://taskfile.dev) installed, you can run `task example`.
Otherwise, run the following commands:

```bash
bun install
cargo run -- -p app example/proto.ts
mkdir -p example/dist
bun build example/app.ts --outfile example/dist/app.js
bun build example/worker.ts --outfile example/dist/worker.js
bunx serve example
```

Then open the displayed URL in your browser and open the devtool console.

### Walkthrough

Suppose we have a web application that talks to a web worker.

The web application:

- Create and starts the worker
- Makes sure the worker is ready before doing anything
  - Worker will send a message when ready
- Calls a function on the worker to do some work

The web worker:

- Does some initialization
- Signals the web application that it's ready
- Handles the function call from the web application

The interface can be defined as

```typescript
// file: example/proto.ts
import { WorkexPromise as Promise } from "./workex";

/** Messages to be handled by the App */
export interface AppMsgHandler {
  /** Signal that the worker is ready */
  ready(): Promise<void>;
}

/** Messages to be handled by the worker */
export interface WorkerMsgHandler {
  /** Confirmation that app knows we are ready */
  readyCallback(): Promise<void>;
  /** Do some work and return the result as string */
  doWork(): Promise<string>;
}
```

Now run the bindgen tool to create the interfaces and workex library

```bash
workex --protocol app example/proto.ts
```

Now we can write our web worker:

```typescript
// file: exmaple/worker.ts
import { hostFromDelegate, type Delegate } from "./workex";
import { bindWorkerMsgHandlerHost } from "./WorkerMsgHandler.recv.ts";
import { AppMsgHandlerClient } from "./AppMsgHandler.send.ts";
import type { WorkerMsgHandler } from "./proto.ts";

// helper function to help us distinguish between app and worker logs
function print(msg: any) {
  console.log("worker: " + msg);
}

// do some initialization
// ... not shown here
print("started");

async function someExpensiveWork(): Promise<string> {
  // do some expensive work
  let now = Date.now();
  while (Date.now() - now < 2000) {
    // do nothing
  }
  return "Hello from worker!";
}

// flag to check if app has called back saying it's ready
let isAppReady = false;

// Create the handler to handle the messages sent by app
//
// Using the `Delegate` type, each function here returns a regular
// Promise instead of WorkexPromise. Then later we use `hostFromDelegate`
// to wrap the result of each function as WorkexPromise

// Note that making a class and `new`-ing it will not work
// because how hostFromDelegate is implemented
const handler = {
  async readyCallback(): Promise<void> {
    print("received ready callback from app");
    isAppReady = true;
  },
  doWork(): Promise<string> {
    print("received doWork request from app");
    const result = someExpensiveWork();
    print("work done!");
    return result;
  },
} satisfies Delegate<WorkerMsgHandler>;

const options = {
  worker: self,
  useAddEventListener: true,
};

// Now we bind the handler to the worker
bindWorkerMsgHandlerHost(hostFromDelegate(handler), options);

// Create the client that will be used to send messages to the app
const client = new AppMsgHandlerClient(options);

print("initialized");

// tell the app we are ready
async function main() {
  // According to https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Introducing_workers,
  // Workers are started as soon as they are created.
  // So we have this handshake process to ensure we don't miss the ready call
  // In my testing in both Chrome and Firefox however, the worker does not start
  // until the current task is finished, but I cannot find any specification/documentation
  // that guarantees that
  let attempt = 0;
  while (!isAppReady) {
    attempt++;
    print("telling app we are ready (attempt " + attempt + ")");
    // we cannot await here, because we might be calling
    // before the app registers the handler,
    // in which case we will be stuck forever
    client.ready();
    // try again after 50ms
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
main();
```

And the web app side:

```typescript
// file: example/app.ts
import { hostFromDelegate, type Delegate, type WorkexResult } from "./workex";
import { bindAppMsgHandlerHost } from "./AppMsgHandler.recv.ts";
import { WorkerMsgHandlerClient } from "./WorkerMsgHandler.send.ts";
import type { AppMsgHandler } from "./proto.ts";

// helper function to help us distinguish between app and worker logs
function print(msg: any) {
  console.log("app: " + msg);
}

export async function createWorker(): Promise<WorkerMsgHandlerClient> {
  print("creating worker");
  const worker = new Worker("/dist/worker.js"); // your worker file
  const options = {
    worker,
    useAddEventListener: true,
  };
  const client = new WorkerMsgHandlerClient(options);
  // so we need to know when it's ready
  await new Promise<void>((resolve) => {
    const handler = {
      async ready(): Promise<void> {
        print("received ready from worker");
        // tell worker we know it's ready
        // we can await here, because when worker calls ready,
        // it has already registered the handler
        await client.readyCallback();
        resolve();
      },
    } satisfies Delegate<AppMsgHandler>;
    bindAppMsgHandlerHost(hostFromDelegate(handler), options);
    print("handlers all set up on app side");
  });
  print("worker ready");

  // at this point, we have completed the handshake, and both sides are ready
  // to communicate
  return client;
}

async function main() {
  print("starting");
  const worker = await createWorker();

  setTimeout(() => {
    // to prove workers are on separate threads
    // log a message while the worker is synchronously
    // doing some work
    print(
      "if this message is before `work done!`, then worker is on a separate thread",
    );
  }, 1000);

  const result: WorkexResult<string> = await worker.doWork();
  if (result.val) {
    print("worker returned:" + result.val);
  } else {
    console.error(result.err);
  }

  // cleanup
  print("terminating worker");
  worker.terminate();
}

main();
```
