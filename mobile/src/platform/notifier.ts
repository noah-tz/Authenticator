// Receives what the background sends with chrome.tabs.sendMessage after a
// scan (src/content.ts shows these as page alerts) and shows the same text
// in the popup's own notification box.
export interface NotifierStore {
  commit(type: string, payload?: unknown): void;
  dispatch(type: string, payload?: unknown): unknown;
}

interface ReplyMessage {
  action?: string;
  account?: string;
  secret?: string;
  text?: string;
}

export function createNotifier(
  getStore: () => NotifierStore | undefined,
  getMessage: (key: string) => string
) {
  return (_tabId: number, raw: unknown): void => {
    const store = getStore();
    const message = (raw || {}) as ReplyMessage;
    if (!store) {
      return;
    }
    let text: string | undefined;
    let refresh = false;
    switch (message.action) {
      case "added":
        text = (message.account || "") + getMessage("added");
        refresh = true;
        break;
      case "errorqr":
        text = getMessage("errorqr");
        break;
      case "secretqr":
      case "errorsecret":
        text = getMessage("errorsecret") + (message.secret || "");
        break;
      case "errorenc":
        text = getMessage("phrase_incorrect");
        break;
      case "text":
        text = message.text;
        break;
      case "migrationfail":
        text = getMessage("migration_fail");
        break;
      case "migrationpartlyfail":
        text = getMessage("migration_partly_fail");
        refresh = true;
        break;
      case "migrationsuccess":
        text = getMessage("updateSuccess");
        refresh = true;
        break;
      default:
        return;
    }
    if (refresh) {
      void store.dispatch("accounts/updateEntries");
    }
    if (text) {
      store.commit("notification/alert", text);
    }
  };
}
