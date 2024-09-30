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
