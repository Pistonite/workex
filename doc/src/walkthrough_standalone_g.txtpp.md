# Walkthrough: Standalone Example

See this example on [GitHub](https://github.com/Pistonite/workex/tree/main/examples/standalone),
where you can find the instructions to run it yourself.

## Setup

This example is a web application that talks to a web worker.

The web application:

- Create and starts the worker
- Makes sure the worker is ready before doing anything
  - Worker will send a message when ready
- Calls a function on the worker to do some work

The web worker:

- Does some initialization
- Signals the web application that it's ready
- Handles the function call from the web application

## Run Workex

The interface can be defined as

```typescript
// src/msg/proto.ts
//TXTPP#include ../../examples/standalone/src/msg/proto.ts
```

Now run workex to generate the interfaces and workex library

```bash
workex --protocol app src/msg/proto.ts
```
```admonish info
Run inside the `examples/standalone` directory.
If you don't have `workex` installed yet, use `cargo run --` instead.
```

## The Worker Side
See the comments in the code that walks through the implementation
```typescript
//TXTPP#include ../../examples/standalone/src/worker.ts
```

## The Web App Side
See the comments in the code that walks through the implementation
```typescript
//TXTPP#include ../../examples/standalone/src/app.ts
```
