# The "End"

To address the complication of the raw `postMessage` API,
`workex` puts an abstration layer on top using the `WxEnd` type.
"End" refers to one end of a channel. When you call `send` from one `WxEnd`,
the other `WxEnd` receives that message through a callback registered when
creating that end, no question asked. There can only be one callback registered
on the end.

Furthermore, `WxEnd` also encapsulates establishing the communication,
think of this code:

```typescript
// main thread
const worker = new Worker("worker.js");
worker.postMessage(1);
console.log(2);
// wait for 1 second synchronously
const start = performance.now()
while (performance.now() - start < 1000) {}
console.log(3);


// worker.js
console.log("worker");
globalThis.addEventListener("message", ({data}) => {
    console.log(data);
});
```

```admonish note
The MDN docs used to mention "worker starts executing immediately after contructor",
but when I checked at the time of writing, I cannot find that statement anymore.
Either way, that behavior is NOT mentioned in the standard, and neither is the
contrary.
```

Intuitively, you might compare `new Worker()` to spawning a native thread,
in which case code in `worker.js` should execute right away and log `worker`
before the numbers `1`, `2` or `3`. However, that is not the case.
In Chrome and Firefox, workers don't start executing until the current context
is done, so the output is `2`, `3`, `worker`, `1`.

This is simple, right? Not really. The standard does not specify when a worker
can start executing, or if `postMessage` sent before worker registers the `message`
handler should be delivered (in this case with Chrome/Firefox, they do),
so the correct output to the code above is -- depends on the runtime implementation!

```admonish note
It's possible I am wrong here and maybe test262 or some obsecure section of the spec
details exactly how the behavior should be. If that is the case (or becomes the case
in the future, please let me know)
```

To ensure maximum compability, `WxEnd` does not make any assumption, which means
it is initially operating in a situation where it doesn't know if the other end
has started or is ready. This is the second encapsulation `WxEnd` provides:
`WxEnd` has an invariant where the communication must be established, and any
end sending message can be delivered on the other end.

Internally, `WxEnd` defines an `active` and a `passive` end. The `active` end
is to first send a stream of hellos, until the `passive` end responds, in which
case the communication is established. For example:
- When creating worker from main thread, the worker is the `active` end
  and the main thread is the `passive` end
- When opening or embedding a window, the opener/parent is the `passive` end
  and the opened/embedded window is the `active` end.



