import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const EN = resolve(import.meta.dirname, "../../_locales/en/messages.json");
const URL_PATH = "/_locales/en/messages.json";

// src/store/i18n.ts fetches /_locales/en/messages.json to learn the key list.
// Serve it from the dev server and emit it into dist on build.
export function locales(): Plugin {
  return {
    name: "locales",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== URL_PATH) return next();
        res.setHeader("Content-Type", "application/json");
        res.end(readFileSync(EN));
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: URL_PATH.slice(1),
        source: readFileSync(EN),
      });
    },
  };
}
