# Bidirectional Unicall System (BUS)

```admonish warning
This is term completely made up by me to fit the BUS acronym and does not
have significance in the industry!
```

With the `WxEnd` abstraction, we have a uniform way of communicating
between different contexts, regardless of if it's between `Window`s,
`Worker`s, or any combination or nested combination of them. The **Bidirectional
Unicall System** is the layer on top of `WxEnd` that implements
the **Remote Procedure Call**, or RPC.

This layer turns messaging into async function call - the implementation is
basically
```typescript
// this is pseudo code and greatly simplified, 
// not how the BUS is actually implemented
function callRPC() {
    return new Promise(resolve => {
        end.postMessage({
            id: 1,
            call: "foo",
            args: ["bar"]
        });
        end.onmessage = ({data}) => {
            if (data.id === 1) {
                resolve(data.returnvalue);
            }
        };
    });
}
```

In reality, the implementation is slightly more complicated to handle
potential errors, timeouts, catching exceptions on the other end and send
it back, and multiple inflight messages, and perhaps mostly importantly,
muxing different protocols, which will be explained in the next chapter.
