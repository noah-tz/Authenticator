/* eslint-disable @typescript-eslint/ban-types */
interface Module {
  getModule(): Promise<VuexConstructor> | VuexConstructor;
}

interface VuexConstructor {
  state?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };
  mutations?: {
    [key: string]: Function;
  };
  actions?: {
    [key: string]:
      | Function
      | {
          root: boolean;
          handler: Function;
        };
  };
  getters?: {
    [key: string]: Function;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modules?: Record<string, any>;
  plugins?: Array<Function>;
  strict?: boolean;
  devtools?: boolean;
}

interface MenuState {
  version: string;
  zoom: number;
  autolock: number;
  useAutofill: boolean;
  smartFilter: boolean;
  enableContextMenu: boolean;
  theme: string;
  storageArea: "sync" | "local";
}

interface StyleState {
  style: {
    timeout: boolean;
    isEditing: boolean;
    slidein: boolean;
    slideout: boolean;
    fadein: boolean;
    fadeout: boolean;
    show: boolean;
    qrfadein: boolean;
    qrfadeout: boolean;
    notificationFadein: boolean;
    notificationFadeout: boolean;
    hotpDisabled: boolean;
  };
}

interface AccountsState {
  entries: OTPEntryInterface[];
  defaultEncryption: string;
  encryption: Map<string, EncryptionInterface>;
  OTPType: number;
  shouldShowPassphrase: boolean;
  sectorStart: boolean;
  sectorOffset: number;
  second: number;
  notification: string;
  filter: boolean;
  siteName: (string | null)[];
  showSearch: boolean;
  exportData: { [k: string]: OTPEntryInterface };
  exportEncData: { [k: string]: OTPEntryInterface | Key };
  keys: OldKey | Key[];
  wrongPassword: boolean;
  initComplete: boolean;
  // Folders the user has explicitly expanded (collapsed is the default).
  expandedFolders: string[];
  // hash of the entry whose folder-picker dropdown is open, or "" if none.
  // Kept in the store (not component data) so it survives the folder tree's
  // frequent re-renders, which rebuild EntryComponent instances.
  openFolderPicker: string;
  // Whether the bottom-anchored Archive section is collapsed. Collapsed by
  // default so the archive stays out of the way until the user opens it.
  archiveCollapsed: boolean;
  // The entry whose right-click context menu is open, plus the cursor
  // coordinates to position it. An empty hash means no menu is open. Kept in
  // the store (not component data) so the folder tree's frequent re-renders
  // cannot dismiss it — same pattern as openFolderPicker.
  openContextMenu: { hash: string; x: number; y: number };
}

interface NotificationState {
  message: Array<string>;
  confirmMessage: string;
  messageIdle: boolean;
  notification: string;
}

interface AdvisorState {
  insights: AdvisorInsightInterface[];
  ignoreList: string[];
}

interface PermissionsState {
  permissions: PermissionInterface[];
}
