# workex
Worker Exchange. The In-house messaging bindgen library for workers/windows.

## Setup
This library depends on [pure](https://github.com/Pistonite/pure), the in-house TypeScript utility library.

Both `pure` and `workex` should be consumed as git submodules, and the `tsconfig.json` should include:
```json
{
    "compilerOptions": {
        "paths": {
            "pure/*": ["base/rel/path/to/pure/*"],
            "workex": ["base/rel/path/to/workex/lib"],
        }
    },
    "include": ["path/that/includes/the/libraries"]
}
```

Then, install the bindgen tool with
```
cargo install --git https://github.com/Pistonite/workex
```

## Usage
The command line usage is
```
workex INPUT [...INPUTS] --protocol PROTOCOL
```
The `INPUTS` are TypeScript files that contain `export interface` declarations.
All exported interface will be scanned. If you want to exclude some interface,
put them in another file that's not part of the `INPUTS`.
Other exports are ignored, including:

- `export type`
- `declare`

All `import` statements will also be included in the output, no unused import analysis is done.
Note that you should almost always only import types that are used in the interfaces, which means
they should also be used in the output.

Some syntaxes are not supported:
- namespaces
- imports in the middle of exports (why)
Unsupported syntax will generate an error.

The `protocol` should be a JavaScript literal, such as `"myproto"` (The quotes need to be part
of the input, so in shell you might need to use `'"myproto"'`. This is used to filter messages
when multiple protocols are in use.

All interfaces involved in the protocol must be put into the same single `workex` call, because
each function call is unique in the protocol across all interfaces.

All inputs also must be in the same directory, which will also be the output directory

## Inputs
The input interfaces need to satisfy the following requirement:
- All members need to be regular functions (not `get` or `set`)
- Return type needs to be `WorkexPromise` (just use `WorkexPromise` in places you would normally use `Promise`)

For example:
```typescript
import type { WorkexPromise } from "workex";

/// Comments here are kept
export interface Foo {
    /// Comments here are also kept
    doStuff1(): WorkexPromise<void>;
    /** JSDoc works too */
    doStuff2(arg1: string, arg2: string): WorkexPromise<string>;
}
```

You can also use `Result` return types from `pure/result` if you import them.

## Outputs
The outputs are:
- One `protocol.ts` file containing protocol constants
- One `Foo.send.ts` and `Foo.recv.ts` for each `export interface Foo`
  - `send` is consumed by the side that **calls** the `Foo` interface
  - `recv` is consumed by the side that **implements** the `Foo` interface
- One `send.ts` that re-exports all `*.send.ts`
- One `recv.ts` that re-exports all `*.recv.ts`

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
On the recv side (i.e. host/implementer), use the `bindFoo` function generated per `Foo` interface.

```typescript
import { bindFoo } from "my/out/dir/recv.ts";

// Anything that looks like `WorkerLike` is accepted
const worker = getMyWorker();
// The object that will be receiving the calls from remote
const foo: Foo = createMyFoo();

bindFoo(foo, {
    worker,
    useAddEventListener: true,
});
```
    
See [types.ts](lib/types.ts) for more options available
