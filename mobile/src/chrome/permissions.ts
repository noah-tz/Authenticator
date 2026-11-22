import { dual, Callback } from "./dual";

// Permissions that the Chrome extension holds. contextMenus and any host
// origin (including www.google.com for the clock sync) are not available in
// the app, so the code that depends on them stays switched off.
const GRANTED = new Set([
  "alarms",
  "clipboardWrite",
  "identity",
  "scripting",
  "storage",
]);

interface Request {
  permissions?: string[];
  origins?: string[];
}

function granted(request: Request): boolean {
  if (request.origins && request.origins.length > 0) return false;
  return (request.permissions || []).every((p) => GRANTED.has(p));
}

export function createPermissions() {
  const answer = (request: Request, callback?: Callback<boolean>) =>
    dual(callback, async () => granted(request));
  return {
    contains: answer,
    request: answer,
    getAll: (callback?: Callback<Request>) =>
      dual(callback, async () => ({
        permissions: [...GRANTED],
        origins: [] as string[],
      })),
    remove: (_request: Request, callback?: Callback<boolean>) =>
      dual(callback, async () => false),
  };
}
