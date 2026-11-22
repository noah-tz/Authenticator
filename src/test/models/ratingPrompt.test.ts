import "mocha";
import * as chai from "chai";
import { assert } from "chai";
import * as sinonChai from "sinon-chai";
import {
  shouldShowRatingPrompt,
  mergeRatingState,
  RATING_PROMPT_DELAY_MS,
} from "../../models/ratingPrompt";

chai.should();
chai.use(sinonChai);
mocha.setup("bdd");

describe("shouldShowRatingPrompt", () => {
  const first = 1000000;

  it("hides when firstSeen is missing", () => {
    assert.isFalse(shouldShowRatingPrompt(first + RATING_PROMPT_DELAY_MS, {}));
  });

  it("hides before 30 days", () => {
    assert.isFalse(
      shouldShowRatingPrompt(first + RATING_PROMPT_DELAY_MS - 1, {
        firstSeen: first,
      })
    );
  });

  it("shows at 30 days", () => {
    assert.isTrue(
      shouldShowRatingPrompt(first + RATING_PROMPT_DELAY_MS, {
        firstSeen: first,
      })
    );
  });

  it("hides when dismissed", () => {
    assert.isFalse(
      shouldShowRatingPrompt(first + RATING_PROMPT_DELAY_MS * 5, {
        firstSeen: first,
        dismissed: true,
      })
    );
  });

  it("hides while snoozed and shows after the snooze ends", () => {
    const now = first + RATING_PROMPT_DELAY_MS;
    const snoozedUntil = now + RATING_PROMPT_DELAY_MS;
    assert.isFalse(
      shouldShowRatingPrompt(now + 1, { firstSeen: first, snoozedUntil })
    );
    assert.isTrue(
      shouldShowRatingPrompt(snoozedUntil, { firstSeen: first, snoozedUntil })
    );
  });
});

describe("mergeRatingState", () => {
  it("lets a true never-ask flag win over false or missing", () => {
    assert.isTrue(
      mergeRatingState({ dismissed: true }, { dismissed: false }).dismissed
    );
    assert.isTrue(mergeRatingState({}, { dismissed: true }).dismissed);
    assert.isUndefined(mergeRatingState({ dismissed: false }, {}).dismissed);
  });
  it("lets the later snooze-until timestamp win", () => {
    assert.equal(
      mergeRatingState({ snoozedUntil: 100 }, { snoozedUntil: 200 })
        .snoozedUntil,
      200
    );
    assert.equal(
      mergeRatingState({ snoozedUntil: 300 }, { snoozedUntil: 200 })
        .snoozedUntil,
      300
    );
    assert.equal(mergeRatingState({}, { snoozedUntil: 200 }).snoozedUntil, 200);
    assert.isUndefined(mergeRatingState({}, {}).snoozedUntil);
  });
  it("never carries firstSeen", () => {
    assert.isUndefined(
      mergeRatingState({ firstSeen: 1 }, { firstSeen: 2 }).firstSeen
    );
  });
});
