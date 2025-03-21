# Walkthrough: Standalone Example

See this example on [GitHub](https://github.com/Pistonite/workex/tree/main/packages/example-standalone),
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

The example references the TS SDK in the PNPM workspace, which requires
you to use `pnpm` as the package manager. Additionally, it uses
`bun` as a bundler to build the TS files.

```admonish tip
If you don't have pnpm, you can either install it,
or replace the version of `@pistonite/workex` in `package.json`
with the latest version published on npmjs.org, and then
install the node modules with your favorite package manager
```

## Run Workex

The interface can be defined as

```typescript
// src/msg/proto.ts
//TXTPP#include ../../example-standalone/src/msg/proto.ts
```

Now run workex to generate the interfaces and workex library

```bash
workex --protocol app src/msg/proto.ts
```
```admonish info
Run inside the example (`packages/example-standalone`) directory.
If you don't have `workex` installed yet, use `cargo run --` instead.
```

## The Worker Side
See the comments in the code that walks through the implementation
```typescript
// src/worker.ts
//TXTPP#include ../../example-standalone/src/worker.ts
```

## The Web App Side
See the comments in the code that walks through the implementation
```typescript
// src/app.ts
//TXTPP#include ../../example-standalone/src/app.ts
```
## Run the Example
First let's do a type check with `tsc`

```bash
bunx tsc
```

Then, build the project

```bash
mkdir -p dist
bun build src/app.ts --outfile dist/app.js --minify
bun build src/worker.ts --outfile dist/worker.js --minify
```

Finally, serve the project

```bash
bunx serve .
```

Open the served page in the browser and open the console. You should see the message exchange
working as expected!
```
app: starting
app: creating worker
app: waiting for handshake to be established
worker: started
app: worker ready
worker: received doWork request from app
app: if this message is before `work done!`, then worker is on a separate thread
worker: work done!
app: worker returned:Hello from worker!
app: terminating worker
```
