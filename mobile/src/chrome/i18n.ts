type Placeholders = { [name: string]: { content: string } };
type Messages = {
  [key: string]: { message: string; placeholders?: Placeholders };
};

const files = import.meta.glob("../../../_locales/*/messages.json", {
  import: "default",
}) as { [path: string]: () => Promise<Messages> };

let current: Messages = {};
let fallback: Messages = {};
let uiLocale = "en";

function loader(locale: string): (() => Promise<Messages>) | undefined {
  return files[`../../../_locales/${locale}/messages.json`];
}

// Locale folders are named like en, pt_BR, zh_CN. Exact match first, then the
// same language, then English.
export function pickLocale(language: string, available: string[]): string {
  const wanted = language.replace("-", "_").toLowerCase();
  const exact = available.find((l) => l.toLowerCase() === wanted);
  if (exact) return exact;
  const base = wanted.split("_")[0];
  return (
    available.find((l) => l.toLowerCase() === base) ||
    available.find((l) => l.toLowerCase().startsWith(base + "_")) ||
    "en"
  );
}

export async function initI18n(language = navigator.language): Promise<void> {
  const available = Object.keys(files).map(
    (p) => /_locales\/([^/]+)\//.exec(p)?.[1] as string
  );
  uiLocale = pickLocale(language, available);
  fallback = await (loader("en") as () => Promise<Messages>)();
  current =
    uiLocale === "en"
      ? fallback
      : await (loader(uiLocale) as () => Promise<Messages>)();
}

export function setMessages(en: Messages, local: Messages = {}): void {
  fallback = en;
  current = local;
}

function expand(
  entry: { message: string; placeholders?: Placeholders },
  subs: string[]
): string {
  const named: Placeholders = {};
  for (const name of Object.keys(entry.placeholders || {})) {
    named[name.toLowerCase()] = (entry.placeholders as Placeholders)[name];
  }
  const withNamed = entry.message.replace(/\$([A-Za-z0-9_@]+)\$/g, (m, name) =>
    named[name.toLowerCase()] ? named[name.toLowerCase()].content : m
  );
  return withNamed.replace(/\$(\$|[1-9])/g, (_m, n) =>
    n === "$" ? "$" : subs[Number(n) - 1] ?? ""
  );
}

export function getMessage(
  key: string,
  substitutions?: string | string[]
): string {
  if (key === "@@ui_locale") return uiLocale;
  const entry = current[key] || fallback[key];
  if (!entry) return "";
  const subs =
    substitutions === undefined
      ? []
      : Array.isArray(substitutions)
      ? substitutions
      : [substitutions];
  return expand(entry, subs);
}

export const i18n = {
  getMessage,
  getUILanguage: () => uiLocale,
};
