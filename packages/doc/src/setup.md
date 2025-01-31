# Setup
The library works as follows:
- You define the messaging protocol as TypeScript interfaces
- Run the CLI tool to generate code in your project
- Use the code!

To get started, install the CLI tool with

```
cargo install --git https://github.com/Pistonite/workex
```
After installing, you can run `workex --help` to see the available options.

The basic usage is
```bash
workex INPUT [...INPUTS] --protocol PROTOCOL
```

`PROTOCOL` is an identifier for all the interfaces in the input files,
for example, `my-awesome-app`. The protocol identifies which set of interfaces
to use when a `Worker` is bound to multiple protocols.


```admonish info
As of version `0.0.5`, the CLI tool no longer generates the runtime dependencies.
This is to make it easier to share the dependency across multiple packages and to
publish packages that depends on `workex`.

This also makes it less awkward that you don't need to run the CLI once
to write the TS input files.
```

The generated code depends on the `@pistonite/workex` TypeScript SDK. You can install
it with your favorite package manager. For example, for `pnpm`:

```bash
pnpm i @pistonite/workex
```

Note that the SDK is TypeScript-only, so a bundler is needed to consume it.

Next, we will take a deeper look into the input format.
