# Error Handling

During one message exchange, a lot of things can go wrong, including:
- Some error happens before the message can be sent
  - For example, the other side is already closed
- The receiving side throws an exception while processing the message
- The receiving side doesn't respond

This is why the interface methods are required
to return a `WorkexPromise<T>` type, which is a `Promise<WorkexResult<T>>`.
The result type is powered by [pure](https://github.com/Pistonite/pure),
which is a type-only implementation of Rust's `Result` type.

The send side can check the result like:
```typescript

const client = ... // this is the client object

const result = await client.doSomething();
// result is WorkexResult<T>

if (result.err) {
    // handle error
    if (result.err.type === "Catch") {
        const message = result.err.message;
        // message can be a few things:
        // - "Terminated" if the worker is terminated
        // - "Timeout" if the worker doesn't respond, and timeout is set
        //   in the options
        // - Best-effort string representation of the error thrown on the other side
        console.error(message);
        return;
    }
    if (result.err.type === "Internal") {
        // this is an internal error, which should not happen
        console.error("Internal error", result.err.message);
        return;
    }
}

// result.val is inferred to be T
console.log(result.val);

```

As you noticed, if the remote side throws an exception,
it will be caught and converted to a string to send to the original
side. This ensures maximum compatibility with the message transport
method (Worker, WebSocket, network call...).

This means if you need to get structured error data from the other side,
throwing exception is not the best option.

You can consider using the `Result` type from `pure` yourself:

```typescript
// Void is the Result type where `void` is returned on success
import type { Void } from "@pistonite/pure/result";
import type { WorkexPromise } from "@pistonite/workex";

import type { MyError } from "somewhere/my_error";

export interface Foo {
    doSomethingCanFail(): WorkexPromise<Void<MyError>>;
}
```

Now you can chain the error handling like this:
```typescript

const client = ... // this is the client object

const messageResult = await client.doSomething();
// result is WorkexResult<T>

if (messageResult.err) {
    // handle the error like above
    ...
    return;
}

const result = messageResult.val;

if (result.err) {
    // handle your error
    console.error(result.err);
    return;
}

// success...
```

Check out the documentation for [pure](https://pure.pistonite.dev) on JSR for more into!
