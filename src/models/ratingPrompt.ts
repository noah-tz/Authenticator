// One-time "please rate us" prompt. State is per device, so it lives in
// chrome.storage.local and never in chrome.storage.sync.
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

export class RatingPromptStorage {
  static async get(): Promise<RatingPromptState> {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return (data[STORAGE_KEY] as RatingPromptState) || {};
  }

  static async set(state: RatingPromptState) {
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  }

  // Loads the state, recording firstSeen the first time this runs.
  static async load(now: number): Promise<RatingPromptState> {
    const state = await RatingPromptStorage.get();
    if (typeof state.firstSeen !== "number") {
      state.firstSeen = now;
      await RatingPromptStorage.set(state);
    }
    return state;
  }
}
