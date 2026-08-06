import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/node.ts", "src/chain.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  // Polyfill `import.meta.url` in the CJS output so the node entry's fs-based
  // circuit resolution (artifacts.ts) works under `require()`, tsup's CJS
  // build otherwise leaves `import.meta` empty and `fileURLToPath(undefined)`
  // crashes at import time.
  shims: true,
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
});
