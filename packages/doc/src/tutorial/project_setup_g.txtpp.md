# Project Setup

We will use a bare-bone node project as the starting point.

If you want to follow along from scratch, create an empty directory.
Or, you can clone the repo and use `packages/example-tutorial` directory,
which has all the code already there. (Code blocks on these tutorial pages actually pull
code directly from those files)

## Project Structure
The project should have `package.json`, `tsconfig.json` and a `src` directory
that is currently empty:

```
- src/
- package.json
- tsconfig.json
```

Run the following to make sure you have `typescript` and `@pistonite/workex` installed.

You can use any package manager - I am using `pnpm` as an example

```
pnpm i -D typescript 
pnpm i @pistonite/workex
```

```admonish tip
The `-D` flag means write the dependency as a `devDependency`.
```

If you want to build and serve the example after the walk-through, also
install `serve`, and make sure you have [`bun`](https://bun.sh/) callable
from the command line. The easiest way to install both is:
```
pnpm i -D serve
pnpm i -g bun
```

Your `package.json` should be similar to the following after installing those
dependencies:
```json
#TXTPP#include ../../../example-tutorial/package.json
```

```admonish note
The version of `@pistonite/workex` in the example is `workspace:*`
because the example in the repo references the library in the workspace.
Yours should be the real version number
```

Now, create `tsconfig.json`:

```json
#TXTPP#include ../../../example-tutorial/tsconfig.json
```

```admonish note
Most of the keys in `tsconfig.json` are only there to have a reasonable base line
for typechecking. The only important configs are:
- `"lib"`: It should contain `"dom"` or `"webworker"`. Alternatively, you can setup
  `types` to reference global types from other runtimes. The global scope must have
  `console`, `setTimeout`, `clearTimeout`, `AbortController`, and `URL`.
- `"allowImportingTsExtensions"`: This allows specifying `.ts` extension in `import`
  statements, which is what the SDK library and generated code does. This slightly
  speeds up bundlers when resolving imports
```
