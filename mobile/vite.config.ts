import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  base: "./",
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

