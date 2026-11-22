import { isSafari } from "../browser";
import { UserSettings } from "../models/settings";
import { ManagedStorage } from "../models/storage";
import { platform } from "../platform";

const DEFAULT_TEXT_SIZE = 125;

export class Menu implements Module {
  async getModule() {
    await UserSettings.updateItems();

    const menuState = {
      state: {
        version: chrome.runtime.getManifest()?.version || "0.0.0",
        zoom: Number(UserSettings.items.zoom) || 100,
        textSize: Number(UserSettings.items.textSize) || DEFAULT_TEXT_SIZE,
        useAutofill: UserSettings.items.autofill === true,
        smartFilter: UserSettings.items.smartFilter === true,
        enableContextMenu: UserSettings.items.enableContextMenu === true,
        theme: UserSettings.items.theme || (isSafari ? "flat" : "normal"),
        autolock: Number(UserSettings.items.autolock) || 30,
        exportDisabled: await ManagedStorage.get("disableExport", false),
        enforcePassword: await ManagedStorage.get("enforcePassword", false),
        enforceAutolock: await ManagedStorage.get("enforceAutolock", false),
        storageArea: await ManagedStorage.get<"sync" | "local">("storageArea"),
        feedbackURL: await ManagedStorage.get<string>("feedbackURL"),
        passwordPolicy: await ManagedStorage.get<string>("passwordPolicy"),
        passwordPolicyHint: await ManagedStorage.get<string>(
          "passwordPolicyHint"
        ),
      },
      mutations: {
        setZoom: (state: MenuState, zoom: number) => {
          state.zoom = zoom;
          UserSettings.items.zoom = zoom;
          UserSettings.commitItems();
          this.resize(zoom);
        },
        setTextSize: (state: MenuState, textSize: number) => {
          state.textSize = textSize;
          UserSettings.items.textSize = textSize;
          UserSettings.commitItems();
          this.applyTextSize(textSize);
        },
        setAutofill(state: MenuState, useAutofill: boolean) {
          state.useAutofill = useAutofill;
          UserSettings.items.autofill = useAutofill;
          UserSettings.commitItems();
        },
        setSmartFilter(state: MenuState, smartFilter: boolean) {
          state.smartFilter = smartFilter;
          UserSettings.items.smartFilter = smartFilter;
          UserSettings.commitItems();
        },
        setEnableContextMenu(state: MenuState, enableContextMenu: boolean) {
          state.enableContextMenu = enableContextMenu;
          UserSettings.items.enableContextMenu = enableContextMenu;
          UserSettings.commitItems();
        },
        setTheme(state: MenuState, theme: string) {
          state.theme = theme;
          UserSettings.items.theme = theme;
          UserSettings.commitItems();
        },
        setAutolock(state: MenuState, autolock: number) {
          state.autolock = autolock;
          UserSettings.items.autolock = autolock;
          UserSettings.commitItems();
        },
      },
      namespaced: true,
    };

    this.resize(menuState.state.zoom);
    this.applyTextSize(menuState.state.textSize);

    return menuState;
  }

  // Android app only: mobile/src/mobile.css scales the page by --ui-scale.
  private applyTextSize(textSize: number) {
    if (platform.isMobile) {
      document.documentElement.style.setProperty(
        "--ui-scale",
        String(textSize / 100)
      );
    }
  }
  private resize(zoom: number) {
    if (zoom !== 100) {
      document.body.style.marginBottom = 480 * (zoom / 100 - 1) + "px";
      document.body.style.marginRight = 320 * (zoom / 100 - 1) + "px";
      document.body.style.transform = "scale(" + zoom / 100 + ")";
    }
  }
}
