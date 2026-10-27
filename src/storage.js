export const ENTRIES_STORAGE_KEY = "stimmungstagebuch.entries.v1";
export const LANGUAGE_STORAGE_KEY = "stimmungstagebuch.language.v1";
export const DATA_VERSION = 1;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OPTIONAL_SCALE_FIELDS = ["energy", "tension", "sleepQuality"];

function validationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function isValidLocalDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function isValidTimestamp(value) {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
}

function isScaleValue(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

function validateText(value, field) {
  if (typeof value !== "string" || value.length > 2000) {
    throw validationError(`invalid_${field}`);
  }
  return value;
}

export function validateEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw validationError("invalid_entry");
  }
  if (typeof entry.id !== "string" || entry.id.trim() === "") {
    throw validationError("invalid_id");
  }
  if (!isValidLocalDate(entry.date)) throw validationError("invalid_date");
  if (!isScaleValue(entry.mood)) throw validationError("invalid_mood");

  const normalized = {
    id: entry.id,
    date: entry.date,
    mood: entry.mood,
  };
  for (const field of OPTIONAL_SCALE_FIELDS) {
    const value = entry[field] ?? null;
    if (value !== null && !isScaleValue(value)) {
      throw validationError(`invalid_${field}`);
    }
    normalized[field] = value;
  }
  normalized.notes = validateText(entry.notes ?? "", "notes");
  normalized.medications = validateText(entry.medications ?? "", "medications");

  if (!isValidTimestamp(entry.createdAt)) throw validationError("invalid_created_at");
  if (!isValidTimestamp(entry.updatedAt)) throw validationError("invalid_updated_at");
  normalized.createdAt = entry.createdAt;
  normalized.updatedAt = entry.updatedAt;
  return normalized;
}

export function validateEntries(entries) {
  if (!Array.isArray(entries)) throw validationError("invalid_entries");
  const dates = new Set();
  const ids = new Set();
  const normalized = entries.map((entry) => validateEntry(entry));
  for (const entry of normalized) {
    if (dates.has(entry.date)) throw validationError("duplicate_date");
    if (ids.has(entry.id)) throw validationError("duplicate_id");
    dates.add(entry.date);
    ids.add(entry.id);
  }
  return normalized;
}

export function parseBackup(text) {
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw validationError("invalid_json");
  }
  if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
    throw validationError("invalid_backup");
  }
  if (backup.schemaVersion !== DATA_VERSION) {
    throw validationError("unsupported_version");
  }

  const entries = validateEntries(backup.entries);
  let language;
  if (Object.hasOwn(backup, "language")) {
    if (!["de", "fr", "en"].includes(backup.language)) {
      throw validationError("invalid_language");
    }
    language = backup.language;
  }
  return { entries, ...(language ? { language } : {}) };
}

export function serializeBackup(entries, language) {
  const backup = {
    schemaVersion: DATA_VERSION,
    entries: validateEntries(entries),
  };
  if (["de", "fr", "en"].includes(language)) backup.language = language;
  return JSON.stringify(backup, null, 2);
}

export function importBackup({
  text,
  existingEntries,
  confirm,
  backupExisting,
  saveEntries,
  beforeConfirm = () => true,
}) {
  const backup = parseBackup(text);
  if (!beforeConfirm()) return { imported: false };
  if (existingEntries.length > 0 && confirm("settings.backupBeforeImport")) {
    backupExisting(existingEntries);
  }
  if (!confirm("settings.confirmImport")) return { imported: false };
  saveEntries(backup.entries);
  return { imported: true, backup };
}

export function createDiaryStore(storage) {
  return {
    loadEntries() {
      const stored = storage.getItem(ENTRIES_STORAGE_KEY);
      if (stored === null) return [];
      let data;
      try {
        data = JSON.parse(stored);
      } catch {
        throw validationError("corrupt_storage");
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw validationError("corrupt_storage");
      }
      if (data.version !== DATA_VERSION) throw validationError("unsupported_version");
      try {
        return validateEntries(data.entries);
      } catch {
        throw validationError("corrupt_storage");
      }
    },

    saveEntries(entries) {
      const validatedEntries = validateEntries(entries);
      storage.setItem(
        ENTRIES_STORAGE_KEY,
        JSON.stringify({ version: DATA_VERSION, entries: validatedEntries }),
      );
    },

    deleteEntry(date) {
      const entries = this.loadEntries();
      const nextEntries = entries.filter((entry) => entry.date !== date);
      this.saveEntries(nextEntries);
      return nextEntries;
    },

    loadLanguage() {
      const language = storage.getItem(LANGUAGE_STORAGE_KEY);
      return ["de", "fr", "en"].includes(language) ? language : null;
    },

    saveLanguage(language) {
      if (!["de", "fr", "en"].includes(language)) {
        throw validationError("invalid_language");
      }
      storage.setItem(LANGUAGE_STORAGE_KEY, language);
    },
  };
}
