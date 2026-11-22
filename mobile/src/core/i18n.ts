import messages from "../../../_locales/en/messages.json";

const table = messages as unknown as Record<string, { message?: string }>;

// Same $1..$9 substitution as chrome.i18n.getMessage.
export function t(key: string, ...subs: string[]): string {
  const entry = table[key];
  if (!entry || typeof entry.message !== "string") {
    return key;
  }
  return entry.message.replace(/\$([1-9])/g, (_m, n: string) => {
    const sub = subs[Number(n) - 1];
    return sub === undefined ? "" : sub;
  });
}