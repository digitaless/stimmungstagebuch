import test from "node:test";
import assert from "node:assert/strict";
import {
  hasDismissedIntro,
  INTRO_DISMISSED_STORAGE_KEY,
  saveIntroDismissal,
} from "../src/onboarding.js";

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    values,
  };
}

test("intro is shown until its separate local dismissal preference is saved", () => {
  const storage = fakeStorage();

  assert.equal(hasDismissedIntro(storage), false);
  saveIntroDismissal(storage, false);
  assert.equal(storage.values.has(INTRO_DISMISSED_STORAGE_KEY), false);
  saveIntroDismissal(storage, true);
  assert.equal(hasDismissedIntro(storage), true);
  assert.deepEqual([...storage.values.keys()], [INTRO_DISMISSED_STORAGE_KEY]);
});

test("intro preference reads and writes fail visibly to the caller", () => {
  const failingStorage = {
    getItem() {
      throw new Error("read denied");
    },
    setItem() {
      throw new Error("write denied");
    },
  };

  assert.throws(() => hasDismissedIntro(failingStorage), /read denied/);
  assert.throws(() => saveIntroDismissal(failingStorage, true), /write denied/);
});
