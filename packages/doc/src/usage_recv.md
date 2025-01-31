# Usage: Recv-side

On the recv side (i.e. host/implementer), use the `bindFooHost` function generated per `Foo` interface.

```typescript
// note here we are importing Foo from the input file
import type { Foo } from "my/out/dir/inputs.ts";
import { bindFoo } from "my/out/dir/sides/worker.ts";

// Anything that looks like `WorkerLike` is accepted
// Inside a web worker, you can use `self` to send message
// to the main thread
const worker = getMyWorker();
// The object that will be receiving the calls from remote
const foo: Foo = createMyFoo();

bindFooHost(foo, { worker });
```

See [types.ts](https://github.com/Pistonite/workex/blob/main/packages/ts-sdk/src/types.ts) for more options available

## Delegate
When binding the worker to a host, any implementation
of the interface defined in the input (`Foo`) will work.
However, if you recall, the functions in the interface
are required to return `WorkexPromise`, which is a promise
of a `Result` type. This is to ensure that any errors
during the message exchange can be caught on the receiving side.

It could be tedious for the implementer to import the types
and wrap everything in a result. To solve this, you
can use a `Delegate` type and `hostFromDelegate` function
to create a host implementation that wraps the return value
with `Result` automatically. Of course, everything is still
type-checked with TypeScript magic.

```typescript
import { hostFromDelegate, type Delegate } from "my/out/dir/workex";
import type { Foo } from "my/out/dir/inputs.ts";
import { bindFoo } from "my/out/dir/sides/worker.ts";

const fooDelegate = {
    // note that this function returns a regular Promise, not WorkexPromise
    async doSomething(): Promise<void> {
        ...
    }
} satisfies Delegate<Foo>;

bindFooHost(hostFromDelegate(fooDelegate), { worker });
```

```admonish danger
The delegate must be a plain object and not instance of a class! This is because
the class methods are defined on the prototype.
```

You might be wondering how exceptions are handled. The next chapter goes
through error handling in detail.
