import { bindFoo } from "my/out/dir/recv.ts";

// Anything that looks like `WorkerLike` is accepted
// You can use `hostFromDelegate` to make this easier.
// See the full example below
const worker = getMyWorker();
// The object that will be receiving the calls from remote
const foo: Foo = createMyFoo();

bindFoo(foo, {
  worker,
  useAddEventListener: true,
});
