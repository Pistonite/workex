# Usage: Send-side

On the send (i.e. calling) side, use the `FooClient` class generated per `Foo` interface.

```typescript
import { FooClient } from "my/out/dir/sides/client.ts";

// Anything that looks like `WorkerLike` is accepted
// for example, new Worker(url)
const worker = getMyWorker();
const foo: Foo = new FooClient({
  worker,
  // if true, onmessage will be assigned instead of using addEventListener
  // false is the default
  assign: false,
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

See [types.ts](https://github.com/Pistonite/workex/blob/main/packages/ts-sdk/src/types.ts) for more options available
