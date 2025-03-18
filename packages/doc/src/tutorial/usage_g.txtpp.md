# Using Generated Code

Finally, we will write the code for the main thread
and the worker that talks to each other using the generated code.

For simplicity, we will put the code for the main thread
and the worker both in `src` directory, as `src/App.ts`
and `src/Worker.ts`. In real projects, these can be put anywhere
as long as they are able to import the generated code.

## App Code

Create `src/App.ts`, and paste in the code below.
See the comments in the code and the summary after for explanation.

```typescript
// src/App.ts
//TXTPP#include ../../../example-tutorial/src/App.ts
```

```admonish summary
The app code does the following things:
1. Defines an implementation of `AppSide`, for the worker to call
   once the connection is established
2. Creates the worker, and connect to it with `wxWorker` function
   from the SDK library, together with the generated bind config
   `testappWorkerSide`
3. Call functions on the returned interface just like normal async
   function calls.
```

```admonish note
Note the curried syntax for `wxWorker`. The `wxWorker` function
actually returns a `WxBusCreatorFn` that can be called with the
config to initialize the connection. 

This way, `wxWorker` can take optional arguments without
having to put them after the config object, which improves
readability. This pattern is used in other "connection creator"
functions too, such as `wxWorkerGlobal`, `wxWindowOwner`, 
and `wxPopup`

```

```admonish note
Also note the usage of `wxWrapHandler`. This is a very thin
wrapper that wraps the return value `T` as a `WxPromise<T>`.
The above handler is equivalent to:

<pre><code class="language-typescript">const handler: AppSide = {
    getData: async (id: string) => {
        if (id === "foo") {
            return { val: "bar" };
        }
        return { val: "" };
    }
}
</code></pre>

```

## Worker Code
Create `src/Worker.ts`, and paste in the code below.
See the comments in the code and the summary after for explanation.

```typescript
// src/Worker.ts
//TXTPP#include ../../../example-tutorial/src/Worker.ts
```

```admonish summary
The worker code is very similar to the app code, with the following difference:
1. Because the worker code needs to call back to the app in its handler,
   it defines a promise using `wxMakePromise` and use it to block the handler
   until the bindings are fully setup.
2. It uses `wxWorkerGlobal`, which connects to the thread that created the worker (
   in this case, the main thread)
```

```admonish tip
If you want to avoid `await appApiPromise` every function in your handler,
you can use this alternative:

<pre><code class="language-typescript">// casting is ok since we don't call this until it's ready
let appApi: AppSide = undefined as AppSide;
const { promise, resolve } = wxMakePromise();
const handler = {
    initialize: async () => {
        await promise;
        return {}
    }
    /* ... other functions ... */
}

/* ... setup the connection ... */

// assign the binding
({ appApi } = result.val);

// resolve the promise
resolve();
</code></pre>

The catch is, the app side has to `await workerApi.initialize()` before
calling other functions to guarantee it's initialized.

```
