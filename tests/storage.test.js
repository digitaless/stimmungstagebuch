import test from "node:test";
import assert from "node:assert/strict";
import {
  createDiaryStore,
  ENTRIES_STORAGE_KEY,
  importBackup,
  LANGUAGE_STORAGE_KEY,
  isValidLocalDate,
  parseBackup,
  serializeBackup,
  validateEntry,
  validateEntries,
} from "../src/storage.js";

const validEntry = (overrides = {}) => ({
  id: "entry-1",
  date: "2024-02-29",
  mood: 3,
  energy: null,
  tension: null,
  sleepQuality: null,
  notes: "",
  medications: "",
  createdAt: "2024-02-29T12:00:00.000Z",
  updatedAt: "2024-02-29T12:00:00.000Z",
  ...overrides,
});

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test("validates required mood, optional scales, text and calendar dates", () => {
  assert.equal(validateEntry(validEntry()).mood, 3);
  assert.equal(validateEntry(validEntry({ energy: 1, tension: 5, sleepQuality: 3 })).energy, 1);
  assert.throws(() => validateEntry(validEntry({ mood: null })), { code: "invalid_mood" });
  assert.throws(() => validateEntry(validEntry({ mood: 6 })), { code: "invalid_mood" });
  assert.throws(() => validateEntry(validEntry({ mood: 2.5 })), { code: "invalid_mood" });
  assert.throws(() => validateEntry(validEntry({ energy: 0 })), { code: "invalid_energy" });
  assert.throws(() => validateEntry(validEntry({ tension: "2" })), { code: "invalid_tension" });
  assert.throws(
    () => validateEntry(validEntry({ notes: "x".repeat(2001) })),
    { code: "invalid_notes" },
  );
  assert.equal(isValidLocalDate("2024-02-29"), true);
  assert.equal(isValidLocalDate("2023-02-29"), false);
  assert.equal(isValidLocalDate("2024-13-01"), false);
});

test("rejects duplicate dates and ids", () => {
  assert.throws(
    () => validateEntries([validEntry(), validEntry({ id: "entry-2" })]),
    { code: "duplicate_date" },
  );
  assert.throws(
    () =>
      validateEntries([
        validEntry(),
        validEntry({ id: "entry-1", date: "2024-03-01" }),
      ]),
    { code: "duplicate_id" },
  );
});

test("saves and reloads versioned data using only diary-specific keys", () => {
  const storage = fakeStorage();
  const store = createDiaryStore(storage);
  assert.deepEqual(store.loadEntries(), []);
  store.saveEntries([validEntry()]);
  store.saveLanguage("fr");

  assert.equal(JSON.parse(storage.getItem(ENTRIES_STORAGE_KEY)).version, 1);
  assert.deepEqual(store.loadEntries(), [validEntry()]);
  assert.equal(store.loadLanguage(), "fr");
  assert.deepEqual([...storage.values.keys()].sort(), [ENTRIES_STORAGE_KEY, LANGUAGE_STORAGE_KEY]);
});

test("updating an entry on its date replaces it without creating a duplicate day", () => {
  const store = createDiaryStore(fakeStorage());
  const initial = validEntry();
  const updated = validEntry({
    mood: 5,
    updatedAt: "2024-03-01T10:00:00.000Z",
  });
  store.saveEntries([initial]);
  store.saveEntries([updated]);
  assert.deepEqual(store.loadEntries(), [updated]);
});

test("deletes an entry and persists the resulting entry list", () => {
  const store = createDiaryStore(fakeStorage());
  store.saveEntries([
    validEntry(),
    validEntry({ id: "entry-2", date: "2024-03-01", mood: 5 }),
  ]);
  const remaining = store.deleteEntry("2024-02-29");
  assert.deepEqual(remaining, [
    validEntry({ id: "entry-2", date: "2024-03-01", mood: 5 }),
  ]);
  assert.deepEqual(store.loadEntries(), remaining);
});

test("rejects corrupted and unsupported stored data without replacing it", () => {
  const storage = fakeStorage({
    [ENTRIES_STORAGE_KEY]: "{invalid",
  });
  const store = createDiaryStore(storage);
  assert.throws(() => store.loadEntries(), { code: "corrupt_storage" });
  assert.equal(storage.getItem(ENTRIES_STORAGE_KEY), "{invalid");

  storage.setItem(ENTRIES_STORAGE_KEY, JSON.stringify({ version: 99, entries: [] }));
  assert.throws(() => store.loadEntries(), { code: "unsupported_version" });
});

test("exports and imports a validated versioned backup with language", () => {
  const serialized = serializeBackup([validEntry()], "en");
  assert.deepEqual(parseBackup(serialized), {
    entries: [validEntry()],
    language: "en",
  });
  assert.throws(() => parseBackup("{invalid"), { code: "invalid_json" });
  assert.throws(
    () => parseBackup(JSON.stringify({ schemaVersion: 2, entries: [] })),
    { code: "unsupported_version" },
  );
  assert.throws(
    () =>
      parseBackup(
        JSON.stringify({
          schemaVersion: 1,
          entries: [validEntry(), validEntry({ id: "entry-2" })],
        }),
      ),
    { code: "duplicate_date" },
  );
  assert.throws(
    () =>
      parseBackup(
        JSON.stringify({ schemaVersion: 1, entries: [validEntry()], language: "it" }),
      ),
    { code: "invalid_language" },
  );
});

test("validates before confirmation, and cancellation leaves existing entries intact", () => {
  const existing = validEntry({ id: "keep-me", date: "2024-03-01" });
  const incoming = validEntry({ id: "incoming", date: "2024-03-02", mood: 5 });
  let savedEntries = [existing];
  const prompts = [];
  const result = importBackup({
    text: serializeBackup([incoming], "fr"),
    existingEntries: savedEntries,
    confirm(key) {
      prompts.push(key);
      return key !== "settings.confirmImport";
    },
    backupExisting() {
      return true;
    },
    saveEntries(entries) {
      savedEntries = entries;
    },
  });
  assert.deepEqual(prompts, ["settings.backupBeforeImport", "settings.confirmImport"]);
  assert.deepEqual(savedEntries, [existing]);
  assert.deepEqual(result, { imported: false });

  assert.throws(
    () =>
      importBackup({
        text: JSON.stringify({ schemaVersion: 1, entries: [incoming, incoming] }),
        existingEntries: savedEntries,
        confirm() {
          assert.fail("Invalid backup must be rejected before confirmation");
        },
        backupExisting() {
          assert.fail("Invalid backup must not trigger a backup download");
        },
        saveEntries() {
          assert.fail("Invalid backup must not overwrite data");
        },
      }),
    { code: "duplicate_date" },
  );
  assert.deepEqual(savedEntries, [existing]);
});

test("allows replacing entries without downloading an optional backup", () => {
  const existing = validEntry({ id: "keep-me", date: "2024-03-01" });
  const incoming = validEntry({ id: "incoming", date: "2024-03-02", mood: 5 });
  let savedEntries = [existing];
  const result = importBackup({
    text: serializeBackup([incoming]),
    existingEntries: savedEntries,
    confirm: (key) => key === "settings.confirmImport",
    backupExisting() {
      assert.fail("Backup download was declined");
    },
    saveEntries(entries) {
      savedEntries = entries;
    },
  });
  assert.equal(result.imported, true);
  assert.deepEqual(savedEntries, [incoming]);
});

test("does not ask for import confirmation if unsaved changes are not accepted", () => {
  const existing = validEntry({ id: "keep-me", date: "2024-03-01" });
  const incoming = validEntry({ id: "incoming", date: "2024-03-02", mood: 5 });
  const result = importBackup({
    text: serializeBackup([incoming]),
    existingEntries: [existing],
    beforeConfirm: () => false,
    confirm() {
      assert.fail("Import confirmation must not appear");
    },
    backupExisting() {
      assert.fail("Backup must not be downloaded");
    },
    saveEntries() {
      assert.fail("Existing entries must remain intact");
    },
  });
  assert.deepEqual(result, { imported: false });
});

test("failed storage writes leave the previous stored value intact", () => {
  const storage = fakeStorage({
    [ENTRIES_STORAGE_KEY]: JSON.stringify({ version: 1, entries: [validEntry()] }),
  });
  const store = createDiaryStore({
    getItem: storage.getItem,
    setItem() {
      throw new Error("quota exceeded");
    },
  });
  const previous = storage.getItem(ENTRIES_STORAGE_KEY);
  assert.throws(() => store.saveEntries([]), /quota exceeded/);
  assert.equal(storage.getItem(ENTRIES_STORAGE_KEY), previous);
});
