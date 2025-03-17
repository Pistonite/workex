# Project Setup

We will use a bare-bone node project as the starting point.
Create an empty directory and set up the content as follows, or you can
clone the repo and use `packages/example-tutorial` directory.

## Project Structure
The project should have `package.json`, `tsconfig.json` and a `src` directory
that is currently empty:

```
- src/
- package.json
- tsconfig.json
```

Run the following to make sure you have `typescript` and `@pistonite/workex` installed.
You can use any package manager.

```
npm i -D typescript
npm i @pistonite/workex
```

```admonish tip
The `-D` flag means write the dependency as a `devDependency`.
```

At a minimum, your `package.json` should contain:
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
