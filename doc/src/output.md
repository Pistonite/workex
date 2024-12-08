# Output
The outputs are:

- `workex` directory containing the library used by the generated code
- `interfaces` directory containing:
  - One `Foo.send.ts` and `Foo.recv.ts` for each `export interface Foo`
    - `send` is consumed by the side that **calls** the `Foo` interface, by using the `FooClient` class
    - `recv` is consumed by the side that **implements** the `Foo` interface, by calling `bindFooHost` function
- `sides` directory containing one `.ts` file per side declared with `@workex:send` or `@workex:recv`
  annotations in the input. See [TS Interface Input](./input_g.md) for more information.

An example directory tree might look like this after running workex:
```
input.ts (this is the input file)

workex/
  index.ts
  ... other files

interfaces/
  Foo.send.ts
  Foo.recv.ts
  Bar.send.ts
  Bar.recv.ts

sides/
  client.ts
  worker.ts
```

By default, a `.gitignore` will also be generated
in the output to ignore the output directories

