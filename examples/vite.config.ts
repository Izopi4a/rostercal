import { resolve } from "node:path";
import { defineConfig } from "vite";

const root = resolve(import.meta.dirname);
const repoRoot = resolve(root, "..");

export default defineConfig({
  root,
  base: "./",
  resolve: {
    // Order matters: more specific patterns first, since alias matching is prefix-based.
    alias: [
      {
        find: /^@izopi4a\/rostercal\/styles$/,
        replacement: resolve(repoRoot, "src/styles/index.scss"),
      },
      {
        find: /^@izopi4a\/rostercal$/,
        replacement: resolve(repoRoot, "src/index.ts"),
      },
    ],
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: resolve(root, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        monthBasic: resolve(root, "month-basic/index.html"),
        monthThemes: resolve(root, "month-themes/index.html"),
        imperativeApi: resolve(root, "imperative-api/index.html"),
        dnd: resolve(root, "dnd/index.html"),
        rtgWorkerScheduling: resolve(root, "rtg-worker-scheduling/index.html"),
        rtgManyResources: resolve(root, "rtg-many-resources/index.html"),
        crudUrlShorthand: resolve(root, "crud-url-shorthand/index.html"),
        crudFunctionForm: resolve(root, "crud-function-form/index.html"),
        nailSalon: resolve(root, "nail-salon/index.html"),
      },
    },
  },
});
