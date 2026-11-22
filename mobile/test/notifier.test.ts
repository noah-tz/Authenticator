import { describe, expect, it, vi } from "vitest";
import { createNotifier } from "../src/platform/notifier";

const messages: { [key: string]: string } = {
  added: " added",
  errorqr: "bad qr",
  errorsecret: "bad secret ",
  phrase_incorrect: "wrong phrase",
  migration_fail: "migration failed",
  migration_partly_fail: "partly failed",
  updateSuccess: "updated",
};

function setup() {
  const store = { commit: vi.fn(), dispatch: vi.fn() };
  const notify = createNotifier(
    () => store,
    (key) => messages[key] || key
  );
  return { store, notify };
}

describe("getTotp reply notifier", () => {
  it.each([
    [{ action: "errorqr" }, "bad qr", false],
    [{ action: "secretqr", secret: "xyz" }, "bad secret xyz", false],
    [{ action: "errorenc" }, "wrong phrase", false],
    [{ action: "text", text: "hello" }, "hello", false],
    [{ action: "migrationfail" }, "migration failed", false],
    [{ action: "added", account: "me" }, "me added", true],
    [{ action: "migrationpartlyfail" }, "partly failed", true],
    [{ action: "migrationsuccess" }, "updated", true],
  ])("%j shows %j (refresh: %j)", (message, text, refresh) => {
    const { store, notify } = setup();
    notify(1, message);
    expect(store.commit).toHaveBeenCalledWith("notification/alert", text);
    if (refresh) {
      expect(store.dispatch).toHaveBeenCalledWith("accounts/updateEntries");
    } else {
      expect(store.dispatch).not.toHaveBeenCalled();
    }
  });

  it("ignores unrelated and malformed messages", () => {
    const { store, notify } = setup();
    notify(1, { action: "capture" });
    notify(1, undefined);
    expect(store.commit).not.toHaveBeenCalled();
  });

  it("does nothing before the popup store exists", () => {
    const notify = createNotifier(
      () => undefined,
      (key) => key
    );
    expect(() => notify(1, { action: "added", account: "x" })).not.toThrow();
  });
});