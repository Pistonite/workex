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
//TXTPP#include protoExample.ts
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
//TXTPP#include sendExample.ts
```

See [types.ts](lib/types.ts) for more options available

## Recv-side Usage

On the recv side (i.e. host/implementer), use the `bindFooHost` function generated per `Foo` interface.

```typescript
//TXTPP#include recvExample.ts
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
//TXTPP#include ../example/proto.ts
```

Now run the bindgen tool to create the interfaces and workex library

```bash
workex --protocol app example/proto.ts
```

Now we can write our web worker:

```typescript
//TXTPP#include ../example/worker.ts
```

And the web app side:

```typescript
//TXTPP#include ../example/app.ts
```
