# Running the Example

The example we walked through isn't some sample code to show you the syntax.
It's fully runnable!

First, we will run `tsc` to do a sanity type-checking to make sure
the example conforms to the API contracts:
```
pnpm exec tsc
```

```admonish tip
If you are using `npm`, replace `pnpm exec` with `npx`
```

To bundle the TS code we wrote and the SDK library, we will use [`bun`](https://bun.sh/),
which offers zero-config bundling for TypeScript:

```
bun build src/App.ts > dist/index.js
bun build src/Worker.ts > dist/worker.js
```

We will also create a HTML file that does nothing but loads `index.js`:

```html
<!-- dist/index.html -->
-TXTPP#include ../../../example-tutorial/dist/index.html
```

Now run `pnpm exec serve` to serve the example locally, and open
it in your browser. You should see something like this in the console:

```
App: start
App: creating worker
App: connectiong to worker
Worker: start
App: worker connected!
App: calling worker.initialize()
Worker: ready to be initialized!
Worker: (fakely) initialized!
App: calling worker.process()
Worker: processing input: hello foo
App: got response from worker: {val: 'hello foo bar'}
```

```admonish note
Your output might have a different order - That's the magic
of multithreading! Now it's time for you to go back
to the source and see if the output makes sense to you.

You can also try refreshing the window a few times,
and you might see the order of the logs change!
```
