import { resolve } from "node:path";
import { defineConfig, Plugin } from "vitest/config";
import vue2 from "@vitejs/plugin-vue2";
import { vueSvg } from "./build/vueSvg";
import { locales } from "./build/localesPlugin";
import { cjsCallable } from "./build/cjsCallable";

// The Android build keeps the strict CSP from index.html. Only the dev server
// (browser dev mode) relaxes it: Vite injects <style> tags and a HMR websocket,
// and Google Identity Services needs its script, popup and token endpoints.
const devCsp: Plugin = {
  name: "dev-csp",
  apply: "serve",
  transformIndexHtml: {
    order: "pre",
    handler(html) {
      return html.replace(
        /(http-equiv="Content-Security-Policy"\s+content=")[^"]*(")/,
        `$1default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src 'self' https://accounts.google.com; connect-src 'self' ws://localhost:5173 https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com$2`
      );
    },
  },
};

export default defineConfig({
  plugins: [cjsCallable(), vue2(), vueSvg(), locales(), devCsp],
  root: import.meta.dirname,
  base: "./",
  // node-gost-crypto (pulled in via the shared KeyUtilities) reads the Node `global` at load
  // time; without this alias the whole bundle throws ReferenceError and the screen stays blank.
  define: { global: "globalThis" },
  resolve: {
    // one Vue copy for mobile/ and ../src (which would otherwise resolve the root node_modules)
    alias: {
      vue: resolve(
        import.meta.dirname,
        "node_modules/vue/dist/vue.runtime.esm.js"
      ),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        import: resolve(import.meta.dirname, "import.html"),
        argon: resolve(import.meta.dirname, "argon.html"),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [".."] },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
