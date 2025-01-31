# TS Config

The generated code is in TypeScript, so your project need to use TypeScript.
Additionally, make sure you have the following compiler options set
in your `tsconfig.json`

```json
{
    "compilerOptions": {
        /* ... your other options ... */

        /* 
         * The generated code uses .ts in the imports,
         * This helps modern build tools like Vite to resolve
         * the import faster
         */
        "allowImportingTsExtensions": true,
    },
}
```
