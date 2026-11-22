import type { Plugin } from "vite";

// src/components/Popup/EntryComponent.vue does `import * as QRGen from
// "qrcode-generator"` and calls QRGen(). webpack hands back the CommonJS
// function for a namespace import; Rollup/Rolldown return a namespace object,
// which cannot be called. Rewrite to a default import in the mobile build only.
const CALLABLE_CJS = ["qrcode-generator"];

export function cjsCallable(): Plugin {
  const pattern = new RegExp(
    `import \\* as (\\w+) from "(${CALLABLE_CJS.join("|")})";`,
    "g"
  );
  return {
    name: "cjs-callable",
    enforce: "pre",
    transform(code, id) {
      if (!/\.(vue|ts)$/.test(id.split("?")[0])) return null;
      if (!CALLABLE_CJS.some((m) => code.includes(`"${m}"`))) return null;
      const out = code.replace(pattern, 'import $1 from "$2";');
      return out === code ? null : { code: out, map: null };
    },
  };
}
