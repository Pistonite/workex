# TS Interface Input

The CLI program takes in a number of TypeScript files that contain
`export interface` declarations.

For example:
```typescript
// the workex library will be generated after you run the tool once
import type { WorkexPromise as Promise } from "./workex";

/** Comments here are kept */
export interface Foo {
  /**
   * Comments here are also kept
   */
  doStuff1(): Promise<void>;
  /// Rust styles will also be kept, if you like them
  doStuff2(arg1: string, arg2: string): Promise<string>;
}
```

Note that all other exports are ignored, including:
- `export type`
- `declare`
```admonish tip
If you need to exclude some interfaces from export, put them in
another file that's not part of the `INPUTS`.
```

All `import` statements will also be included in the output, no unused import analysis is done.
Note that since output is one `interface` per file, it might contain TypeScript unused import errors.
If that happens, you can:

- Separate the interfaces into different files
- Add `// @ts-ignore` to the input file (not recommended)

Some syntaxes are not supported, which will result in an error:

- namespaces
- imports in the middle of exports

```admonish danger
Relative imports are also currently not supported with the exception of importing
from `workex` (the generated library). You can use `baseUrl` in `tsconfig.json` to
map the paths to the correct location.
```

Additionally, all input files also must be in the same directory, which will also be the output directory

## Interface Requirements
The input interfaces need to satisfy the following requirement:

- All members need to be regular functions (not `get` or `set`)
- Return type needs to be `WorkexPromise`, which is a `Promise<WorkexResult<T>>`
  - Typically, you can `import { WorkexPromise as Promise }` and use it as if it's a regular `Promise`
  - This type means you need to handle potential errors during the message exchange, before accessing `T`
    (which itself can be a `Result`)

## Annotations
The tool also looks for annotations in the comments for the interfaces.
It supports the following annotations:
- `@workex:send SIDE` - Marks `SIDE` as the send side of the interface
- `@workex:recv SIDE` - Marks `SIDE` as the receive side of the interface

`SIDE` can be any string and is used to group outputs into re-exports.
For example:

```typescript
import type { WorkexPromise as Promise } from "./workex";

/**
 * @workex:send client
 * @workex:recv worker
 */
export interface A {
    ...
}

/**
 * @workex:send worker
 * @workex:recv client
 */
export interface B {
    ...
}
```

With this setup, you can import everything the `client` side needs
from one file `client.ts`, which re-exports the send implementation
for `A` and the receive implementation for `B`.
