# Error Handling

The SDK uses the result pattern, powered by another of my in-house TypeScript
library - [`pure`](https://pure.pistonite.dev). This is a purely type-based
implementation, so it does not have any runtime overhead (other than having
to check error).

In the SDK, the 2 types used for error handling is [`WxError`](/docs/types/public.WxError)
and [`WxEc`](/docs/types/public.WxEc) which is a string type-union enum that stands for "Error Code".

Each `WxError` has a `code: WxEc` that will tell you what the error is, and optionally
a message that might have more details about the error

```typescript
const result = wxDoSomething();
if (result.err) {
    if (result.err.code === "Timeout") {
        // failed because of time out
    }

    // make this path diverge
    return;
}
// TypeScript can now infer the type of result.val
console.log(result.val);
```
