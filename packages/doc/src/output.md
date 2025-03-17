# Output
The outputs are placed in a directory:

- `interfaces` directory containing:
  - One `Foo.ts` for each `export interface Foo`, which contains an implementation
    that passes the call to the underlying messaging channel to invoke remotely.
  - One `Foo.bus.ts` and `Bar.bus.ts` for each linked interface pair `Foo` and `Bar`,
    each will export a function `protoFoo` and `protoBar` (i.e. the protocol identifier
    passed from CLI appended with the interface name). These are used to configure
    the communication
- `sides` directory containing one `.ts` file per side declared with `@workex:side`.
  Each side will re-export the `protoFoo` function for each `foo` declared
  annotations in the input. See [TS Interface Input](./input_g.md) for more information.
  Each of these side files re-exports the interfaces needed on that side from the `interfaces`

By default, a `.gitignore` will also be generated in the output to ignore the output directories

An example directory tree might look like this after running workex:

```
- input.ts (this is the input file)
- .gitignore
- interfaces/
  - Foo.ts
  - Foo.bus.ts
  - Bar.ts
  - Bar.bus.ts
- sides/
  - client.ts
  - worker.ts
```
