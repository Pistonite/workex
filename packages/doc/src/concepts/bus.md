# The BUS

The `WxEnd` has solved one end of the problems: now we have a reliable way of 
communication, whether it's to `Worker`s or `Window`s, or other objects in the future.
Our problem doesn't end here, though, and the next set of problems are, the *users*

In particular:
1. The 2 ends must have some way to agree on the protocol, i.e. the format of the message data
2. If multiple ends are created on the same messaging channel (say a `Worker`), those
   message should not conflict with each other.
3. Multiple generated libraries should be able to talk in the same `WxEnd` connection.
   For example you have one worker that depends on 2 unrelated libraries that both use `workex`
4. We need an ergonmic calling interface, i.e. `async`/`await` instead of `postMessage` or `send`

This is where the **Bidirectional Unicall System**, or BUS, come in. (Yes I made this one up)

BUS is the layer above `WxEnd`. You can think of it as `TCP/IP`. When using BUS, it also encapsulates
`WxEnd`, so as a user, you don't need to think about it when using it.

The BUS acts as a middle man between communicating with `WxEnd` and your handlers that
implement those interfaces you define, when a call comes in, it will inspect it
and route it to your handler (calls your implementation), then send the returned value
over `WxEnd` to the other side. On the other side, it will find the promise that correspond
to the request, and fulfills it with the return value. This mechanism is *bidirectional*:
from the other end, it works the same. In other words, the BUS doesn't actually care
if it's the `active` or `passive` end (except for once, initially).

From the usage patterns in my projects, I made a few simplifying assumptions when designing
the BUS to make it more workable:
- The interfaces are linked in pairs. For example, if `Foo` and `Bar` are linked,
  passing a `Foo` implementation to a BUS on one side will require a `Bar` implementation
  be passed on the other side. The BUS will then be able to connect them,
  and give the first side a `Bar` proxy and the second side a `Foo` proxy
- This means `Foo` cannot be connected to other interfaces, and only one `Foo-Bar` connection
  can be opened per BUS.
- Other interfaces in the same protocol cannot be added to the same BUS. For example, if the CLI tool
  processed 4 interfaces (2 pairs), only one of those 2 pairs can be added to a BUS.
  - i.e. one pair per protocol.
  
Initially when the BUS is constructed, before any messages are passed through,
the `active` end will send a protocol query to agree with the `passive` end on
the list of protocols they are using. This avoids issues with incompatible versions
of libraries talking to each other.

For example, let's say there are 2 libraries `lib1` and `lib2`:
 - `lib1` defines `Apple` and `AppleServer` interfaces
 - `lib2` defines `Orange` and `OrangeServer` interfaces

Let's say we want this configuration:
- The main thread implements `Apple` and `Orange`, and needs to call `AppleServer` and `OrangeServer`
- The worker implements `AppleServer` and `OrangeServer`, and needs to call `Apple` and `Orange` from
  the main thread.

When the main thread creates the worker, it will pass `Apple` and `Orange` to the BUS.
The BUS knows from generated code that the corresponding protocols are `lib1` and `lib2`,
and the other side is `AppleServer` and `OrangeServer`, so it constructs this query:
```
lib1:Apple->AppleServer,lib2:Orange->OrangeServer
```
Note that the query is formatted as `LIB:PASSIVE->ACTIVE` separated by `,`.
The order of the list doesn't matter, as the protocols must be unique

On the worker side, it's the same story, and the same query is formatted.
The BUS on the worker side (the `active` end) will first send this query to the BUS on the main thread (the `passive` end),
which sees the query is the same, so it sends back an agreement message. Finally, each side
is able to create it nice wrappers for the interfaces and pass them back to the user to call.



