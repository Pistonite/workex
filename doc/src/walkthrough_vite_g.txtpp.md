# Walkthrough: Vite

See this example on [GitHub](https://github.com/Pistonite/workex/tree/main/examples/vite),
where you can find the instructions to run it yourself.

```admonish tip
Check out the `standalone` example first to understand the basics,
if you are not already familiar with Vite and React. Otherwise
you might get lost pretty fast!
```

## Setup

The standalone example shows a scenario where the app calls
the worker through workex. In this example, let's go a step further.
The app will call the worker, and the worker needs to call back
to the app to get some data.

```admonish tip
This pattern is very useful if there are some very large data
that doesn't make sense to send to the worker. Instead, it
is required that the worker should compute what it needs,
then asks for it.
```

## Workex Setup

Similar to the standalone example, let's define the messaging interfaces first
```typescript
// src/msg/proto.ts
//TXTPP#include ../../examples/vite/src/msg/proto.ts
```
Now run workex to generate the interfaces and workex library

```bash
workex --protocol greet src/msg/proto.ts
```
```admonish info
Run inside the `examples/vite` directory.
If you don't have `workex` installed yet, run `npm run workex` instead.
```

## The Worker Side
See the comments in the code that walks through the implementation
```typescript
// src/worker.ts
//TXTPP#include ../../examples/vite/src/worker.ts
```

## The App Side
In the React app, we will make a button that will call the worker
when clicked.
```typescript
// src/App.tsx
//TXTPP#include ../../examples/vite/src/App.tsx
```

## Run the Example
```bash
npm run dev
```
