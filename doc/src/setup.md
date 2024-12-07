# Setup
Currently, Workex depends on [pure](https://github.com/Pistonite/pure), the in-house TypeScript utility library,
to use the `Result` type and some util functions. This dependency might be removed
in the future.

```bash
npx jsr install @pistonite/pure
```

Then, install the CLI tool with

```
cargo install --git https://github.com/Pistonite/workex
```

All runtime dependencies are generated directly in your project when you run workex.
This ensures the generated code is always compatible with the workex library,
and has the correct import paths. The library should be processed
along with your source code using a bundler like Vite for effective tree-shaking.

After installing, you can run `workex --help` to see the available options.

The basic usage is
```bash
workex INPUT [...INPUTS] --protocol PROTOCOL
```

`PROTOCOL` is an identifier for all the interfaces in the input files,
for example, `my-awesome-app`. The protocol identifies which set of interfaces
to use when a `Worker` is bound to multiple protocols.

The next section explains the input format.
