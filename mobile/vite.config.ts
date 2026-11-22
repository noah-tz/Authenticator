import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  // node-gost-crypto (pulled in via the shared KeyUtilities) reads the Node `global` at load
  // time; without this alias the whole bundle throws ReferenceError and the screen stays blank.
  define: { global: "globalThis" },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    fs: { allow: [".."] },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});

