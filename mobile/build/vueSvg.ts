import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Plugin } from "vite";

const require = createRequire(import.meta.url);

// Turns `import Icon from "x.svg"` into a Vue 2 component, like vue-svg-loader
// does in the extension's webpack build. compileTemplate (instead of
// vue-template-compiler's bare output) transpiles away `with(this)`, which ES
// modules do not allow.
export function vueSvg(): Plugin {
  return {
    name: "vue-svg",
    enforce: "pre",
    load(id) {
      const file = id.split("?")[0];
      if (!file.endsWith(".svg")) return null;
      const { compileTemplate } = require("vue/compiler-sfc");
      const source = readFileSync(file, "utf8");
      const result = compileTemplate({
        source,
        filename: file,
        id: file,
        isProduction: true,
      });
      if (result.errors.length > 0) {
        throw new Error(`${file}: ${result.errors.join("; ")}`);
      }
      return `${result.code}\nexport default { render, staticRenderFns };`;
    },
  };
}
