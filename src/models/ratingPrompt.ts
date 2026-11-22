// One-time "please rate us" prompt. The never-ask flag and the snooze time live
// in UserSettings (ratingNeverAsk, ratingSnoozedUntil) so they sync with the
// other settings. firstSeen stays per device in chrome.storage.local.
import { UserSettings } from "./settings";
export const RATING_REVIEWS_URL =
  "https://chromewebstore.google.com/detail/jkfgpemjlahodaicadgfkeehlglbieei/reviews";
export const RATING_PROMPT_DELAY_MS = 30 * 24 * 60 * 60 * 1000;

const STORAGE_KEY = "ratingPrompt";

export interface RatingPromptState {
  // Epoch ms when the extension was first seen on this device.
  firstSeen?: number;
  // Epoch ms before which the prompt stays hidden ("Remind me later").
  snoozedUntil?: number;
  // True once the user rated or declined; never ask again.
  dismissed?: boolean;
}

export function shouldShowRatingPrompt(
  now: number,
  state: RatingPromptState
): boolean {
  if (state.dismissed) {
    return false;
  }
  if (typeof state.firstSeen !== "number") {
    return false;
  }
  if (now < state.firstSeen + RATING_PROMPT_DELAY_MS) {
    return false;
  }
  if (typeof state.snoozedUntil === "number" && now < state.snoozedUntil) {
    return false;
  }
  return true;
}

// Conflict rule for two devices that wrote different values: a true never-ask
// flag wins over false, and the later snooze-until timestamp wins.
export function mergeRatingState(
  a: RatingPromptState,
  b: RatingPromptState
): RatingPromptState {
  const merged: RatingPromptState = {};
  if (a.dismissed || b.dismissed) {
    merged.dismissed = true;
  }
  const snoozes = [a.snoozedUntil, b.snoozedUntil].filter(
    (n): n is number => typeof n === "number"
  );
  if (snoozes.length > 0) {
    merged.snoozedUntil = Math.max(...snoozes);
  }
  return merged;
}

function fromSettings(): RatingPromptState {
  return {
    dismissed: UserSettings.items.ratingNeverAsk,
    snoozedUntil: UserSettings.items.ratingSnoozedUntil,
  };
}

export class RatingPromptStorage {
  private static async getLocal(): Promise<RatingPromptState> {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return (data[STORAGE_KEY] as RatingPromptState) || {};
  }

  // Merges into UserSettings (re-read first so another device's newer write
  // is not lost) and returns the merged shared state.
  private static async saveShared(
    incoming: RatingPromptState
  ): Promise<RatingPromptState> {
    await UserSettings.updateItems();
    const merged = mergeRatingState(fromSettings(), incoming);
    if (merged.dismissed) {
      UserSettings.items.ratingNeverAsk = true;
    }
    if (typeof merged.snoozedUntil === "number") {
      UserSettings.items.ratingSnoozedUntil = merged.snoozedUntil;
    }
    await UserSettings.commitItems();
    return merged;
  }

  // Saves the shared fields and returns the full state.
  static async set(state: RatingPromptState): Promise<RatingPromptState> {
    const merged = await RatingPromptStorage.saveShared(state);
    return { ...merged, firstSeen: state.firstSeen };
  }

  // Loads the state, recording firstSeen the first time this runs and moving
  // any per-device state written by older versions into UserSettings.
  static async load(now: number): Promise<RatingPromptState> {
    const local = await RatingPromptStorage.getLocal();
    let shared: RatingPromptState;
    if (local.dismissed || typeof local.snoozedUntil === "number") {
      shared = await RatingPromptStorage.saveShared(local);
      await chrome.storage.local.set({
        [STORAGE_KEY]: { firstSeen: local.firstSeen },
      });
    } else {
      await UserSettings.updateItems();
      shared = fromSettings();
    }
    let firstSeen = local.firstSeen;
    if (typeof firstSeen !== "number") {
      firstSeen = now;
      await chrome.storage.local.set({ [STORAGE_KEY]: { firstSeen } });
    }
    return { ...shared, firstSeen };
  }
}
