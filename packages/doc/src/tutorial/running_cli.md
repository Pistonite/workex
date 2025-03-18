# Generate Code

Once you have the interfaces defined in the input file(s), it's time to
run the CLI to generate some code!

There are 2 flags that will be most commonly used:
- `-p/--protocol`: A string identifies your package/library. This is used
  to distinguish between multiple libraries generated with `workex` operating
  on the same messaging channel. It can also contain some versioning scheme
  to identify version mismatch, if your protocol is meant to be implemented
  by others
- `-l/--link`: This links 2 interfaces so that if one side of the connection
  implements one, the other side is assumed to implement the other. An interface
  can only be linked to one other interfaces. Unlinked interfaces are linked to
  a "stub" interface.

```admonish tip
The `protocol` string is also used as prefix for generated functions,
if it only contains lowercase alphabetic characters (`a-z`). Otherwise,
you also need specify `--prefix` flag to specify another prefix. Using
this flag is recommended if your protocol contains a version
```

In the example directory, run the following command, which
generates code that refers to the `testapp` protocol and links our `AppSide` and `WorkerSide`

```
workex src/Interfaces.ts -p testapp -l AppSide,WorkerSide
```

```admonish note
The order of `-l` arguments don't matter, i.e. `-l WorkerSide,AppSide` behaves exactly
the same
```

This should generate the `src/interfaces/` directory. Note:
- You can use `--dir` to change the name `interfaces` to something else,
  but it must be a directory in the same directory as the input files
- If there are multiple input files, they must be in the same directory

The directory structure should now look something like:
```
- src/
  - interfaces/
    - AppSide.impl.ts
    - AppSide.bus.ts
    - WorkerSide.impl.ts
    - WorkerSide.bus.ts
    - .gitignore
  - Interfaces.ts
- package.json
- tsconfig.json
```

The `.gitignore` file is automatically generated to ignore the `interfaces`
directory. You can turn it off with `--no-gitignore`.

```admonish tip
The generated files should be ignored from check tools like ESLint or Prettier.
See [ESLint Documentation](https://eslint.org/docs/latest/use/configure/ignore)
or [Prettier Documentation](https://prettier.io/docs/en/ignore.html). The tool
doesn't emit any disable directives because they might cause issues, for example
with ESLint's `--report-unused-directives` option.

If you don't mean to git-ignore the output, you can also use a wrapper command
to call the CLI then run prettier or other formatter automatically on the output
```
