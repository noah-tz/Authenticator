import { describe, expect, it } from "vitest";
import {
  getMessage,
  initI18n,
  pickLocale,
  setMessages,
} from "../src/chrome/i18n";

describe("chrome.i18n shim", () => {
  it("picks exact, language and English locales", () => {
    const available = ["en", "de", "pt_BR", "pt_PT", "zh_CN", "zh_TW"];
    expect(pickLocale("de-AT", available)).toBe("de");
    expect(pickLocale("pt-BR", available)).toBe("pt_BR");
    expect(pickLocale("zh-TW", available)).toBe("zh_TW");
    expect(pickLocale("pt", available)).toBe("pt_BR");
    expect(pickLocale("xx-YY", available)).toBe("en");
  });

  it("loads the real locale files and falls back to English", async () => {
    await initI18n("en-US");
    expect(getMessage("extName")).toBe("Authenticator Folders");
    expect(getMessage("@@ui_locale")).toBe("en");
    expect(getMessage("no_such_key_xyz")).toBe("");
  });

  it("falls back to English for keys missing in the locale", () => {
    setMessages(
      { a: { message: "A en" }, b: { message: "B en" } },
      { a: { message: "A local" } }
    );
    expect(getMessage("a")).toBe("A local");
    expect(getMessage("b")).toBe("B en");
  });

  it("fills $n and named placeholders", () => {
    setMessages({
      numbered: { message: "Hello $1 and $2, $$5" },
      named: {
        message: "Added $ACCOUNT$ to $where$",
        placeholders: {
          account: { content: "$1" },
          WHERE: { content: "$2" },
        },
      },
    });
    expect(getMessage("numbered", ["A", "B"])).toBe("Hello A and B, $5");
    expect(getMessage("named", ["me", "home"])).toBe("Added me to home");
    expect(getMessage("named", "solo")).toBe("Added solo to ");
  });
});
