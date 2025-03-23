# Define Interfaces

The interfaces used for communication can be defined in one or more TypeScript
files. Here, we will create one `src/Interfaces.ts` file that contains
2 interfaces `AppSide` and `WorkerSide`. These interfaces can have any names
that doesn't start with `_` (to avoid name conflicts in generated code)


Create `src/Interfaces.ts` with the following content
```typescript
// src/Interfaces.ts
//TXTPP#include ../../../example-tutorial/src/Interfaces.ts
```

```admonish tip
When defining these interfaces, it's helpful to treat the RPC calls like regular
function calls, i.e. don't think about one side calling the other side with inputs
and the other side calling back with outputs. Instead, think about one side calling
the other side with inputs as an async function call, and the other side returns
the output through the function return.
```

```admonish note
Important rules to note:
1. The interfaces must be declared with `export interface`. 
   Other syntaxes are ignored even if they are technically the same in TypeScript, such as `export type` and `declare`
2. The interfaces cannot contain constructor, getter, or setter signature; only regular functions
3. The functions must return a `WxPromise` type. The import can be renamed, but type alias
   is not supported, as the CLI current doesn't resolve types.

Some of these might be supported in the future, but as for now, these rules help simplify
the parsing
```

```admonish warning
There are some restrictions on syntax that can be used in the interfaces:

- Property signatures are not supported, only methods (change `foo: () => Bar` to `foo(): Bar`)
- Interface type parameters and inheritance are not supported
- Method type parameters are not supported
- The generated files currently copy-paste the same `import` statements from the input
  files. When you have multiple interfaces in one file, it's possible that
  some imports are unused in the output and may cause an error. A workaround
  is to split the input file into one interface per file.

These may be improved in the future
```

```admonish tip
Documentation on the interfaces and functions are preserved in the output.
You can also use the Rust comment style (`/// ...`), but in general, the JS Doc style
(`/** ... */`) has better tooling support
```
