# Event and Messaging
Workex is a TypeScript library (even though the CLI tool is written in Rust). Therefore
it is crucial to understand what messaging is in JS. 

The JS runtime has an internal event loop. Whenever something happens and JS runs (e.g.
user clicks a button), the context is added to the event loop and ran. It's possible 
that the running context schedules more stuff in the event loop, which will run 
after the current context is done. This repeats until there's nothing left to run,
and the runtime becomes idle until something happens again (user clicks button again).
It's also worth noting that this loop is single-threaded, meaning only one thread
can run JS at a time (However while one thread is running JS, other threads can do other stuff
which might be used in JS later).

The `MessageEvent` is an event that is special - it's not triggered by user,
but triggered by another JS object calling `postMessage`. With the message event,
you can pass objects that can be [structured cloned](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)
between 2 different contexts. For example, you can call `postMessage` on a `Worker`
you created, and the worker will get a `MessageEvent`. Since `Worker`s and the main
thread in a browser run in separate threads, you just unlocked multithreaded JS.

The other primary type of messaging in the Web is between different `Window`s.
For example, a window can open a popup and send messages from and to each other.
Note that 2 `Window`s that have the same origin run in the same context, meaning
you can directly pass any object to another window. Cross-origin windows run
in different contexts to avoid Cross-Site Scripting (XSS) attacks

There are also a lot of weird edge cases and quirks about messaging, just listing
a few:
- The main thread can create `Worker`s and call `postMessage` on the created worker,
  the object that receives the message is `globalThis` on the worker side, and `globalThis.postMessage`
  sends the message to the `Worker` object on the main thread. Workers can create other workers,
  and it behaves the same way
- The main thread can create `Window`s by calling `window.open`. If you pass in `noopener` or `noreferrer`,
  then you cannot message to that Window, even though this is not at all documented.
- Unlike workers, if created `Window`s call `globalThis.postMessage`, it's sending the message
  to itself rather than its creator. Similary, calling `addEventListener` on the created window from the main thread
  will not receive the message, because the message is posted to the main thread's `globalThis`
- `Window` can create `Worker` and `Window`, `Worker` cannot create `Window`
- Frames behave similar to `Window`, but you use `window.parent` instead of `window.opener` to access the creator/embedder.
- If windows have the same origin, `postMessage` still work but consumes a lot of CPU
