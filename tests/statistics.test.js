import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateStatistics,
  getConsecutiveSegments,
  getPeriodForPreset,
  subtractCalendarMonths,
  validatePeriod,
} from "../src/statistics.js";

const entry = (date, mood, values = {}) => ({
  date,
  mood,
  energy: null,
  tension: null,
  sleepQuality: null,
  ...values,
});

test("returns empty summary for a valid range without entries", () => {
  const result = calculateStatistics([], "2024-01-01", "2024-01-14");
  assert.equal(result.entryCount, 0);
  assert.equal(result.averageMood, null);
  assert.equal(result.highestMood, null);
  assert.equal(result.lowestMood, null);
  assert.equal(result.dayCount, 14);
  assert.deepEqual(result.entries, []);
});

test("calculates a single entry without treating missing days as zeros", () => {
  const result = calculateStatistics(
    [entry("2024-01-10", 4)],
    "2024-01-01",
    "2024-01-14",
  );
  assert.equal(result.entryCount, 1);
  assert.equal(result.averageMood, 4);
  assert.equal(result.highestMood, 4);
  assert.equal(result.lowestMood, 4);
  assert.equal(result.daysWithEntry, 1);
  assert.equal(result.dayCount, 14);
});

test("calculates correct averages and bounds while excluding out-of-range entries", () => {
  const result = calculateStatistics(
    [
      entry("2023-12-31", 1),
      entry("2024-01-01", 1),
      entry("2024-01-05", 3),
      entry("2024-01-10", 5),
      entry("2024-01-11", 5),
    ],
    "2024-01-01",
    "2024-01-10",
  );
  assert.equal(result.entryCount, 3);
  assert.equal(result.averageMood, 3);
  assert.equal(result.highestMood, 5);
  assert.equal(result.lowestMood, 1);
  assert.equal(result.dayCount, 10);
  assert.deepEqual(result.entries.map((item) => item.date), [
    "2024-01-01",
    "2024-01-05",
    "2024-01-10",
  ]);
});

test("includes both range boundaries and counts consecutive gaps", () => {
  const result = calculateStatistics(
    [entry("2024-01-01", 1), entry("2024-01-03", 3), entry("2024-01-05", 5)],
    "2024-01-01",
    "2024-01-05",
  );
  assert.equal(result.entryCount, 3);
  assert.equal(result.dayCount, 5);
  assert.deepEqual(
    getConsecutiveSegments(result.entries, "mood").map((segment) =>
      segment.map((point) => point.date),
    ),
    [["2024-01-01"], ["2024-01-03"], ["2024-01-05"]],
  );
});

test("connects only documented consecutive dates in the chart", () => {
  const result = calculateStatistics(
    [
      entry("2024-01-01", 1),
      entry("2024-01-02", 2),
      entry("2024-01-05", 3),
      entry("2024-01-06", 4),
    ],
    "2024-01-01",
    "2024-01-06",
  );
  assert.deepEqual(
    getConsecutiveSegments(result.entries, "mood").map((segment) =>
      segment.map((point) => point.value),
    ),
    [[1, 2], [3, 4]],
  );
});

test("averages only valid optional values and ignores absent values", () => {
  const result = calculateStatistics(
    [
      entry("2024-01-01", 2, { energy: 1, tension: null, sleepQuality: 4 }),
      entry("2024-01-02", 4, { energy: null, tension: 5, sleepQuality: 2 }),
      entry("2024-01-03", 3, { energy: 99, tension: "3", sleepQuality: null }),
    ],
    "2024-01-01",
    "2024-01-03",
  );
  assert.equal(result.optional.energy.average, 1);
  assert.equal(result.optional.energy.count, 1);
  assert.equal(result.optional.tension.average, 5);
  assert.equal(result.optional.tension.count, 1);
  assert.equal(result.optional.sleepQuality.average, 3);
  assert.equal(result.optional.sleepQuality.count, 2);
});

test("skips malformed entries defensively and rejects invalid ranges", () => {
  const result = calculateStatistics(
    [entry("2024-02-30", 4), entry("2024-01-01", 0), entry("2024-01-02", 3)],
    "2024-01-01",
    "2024-01-03",
  );
  assert.equal(result.entryCount, 1);
  assert.equal(result.invalidEntryCount, 2);
  assert.throws(
    () => validatePeriod("2024-01-04", "2024-01-03"),
    { code: "invalid_period" },
  );
  assert.throws(
    () => calculateStatistics([], "2024-02-30", "2024-03-01"),
    { code: "invalid_date" },
  );
  assert.throws(() => calculateStatistics(null, "2024-01-01", "2024-01-02"), {
    code: "invalid_entries",
  });
});

test("counts days correctly across months and years", () => {
  assert.equal(validatePeriod("2023-12-30", "2024-01-02").dayCount, 4);
  assert.equal(validatePeriod("2024-01-31", "2024-02-01").dayCount, 2);
  assert.equal(validatePeriod("2024-02-28", "2024-03-01").dayCount, 3);
  assert.equal(validatePeriod("2023-02-28", "2023-03-01").dayCount, 2);
});

test("counts leap day and clamps calendar-month presets at month ends", () => {
  assert.equal(validatePeriod("2024-02-29", "2024-02-29").dayCount, 1);
  assert.equal(subtractCalendarMonths("2024-08-31", 6), "2024-02-29");
  assert.equal(subtractCalendarMonths("2023-08-31", 6), "2023-02-28");
  assert.deepEqual(getPeriodForPreset("14", "2024-03-01"), {
    startDate: "2024-02-17",
    endDate: "2024-03-01",
    dayCount: 14,
  });
  assert.equal(getPeriodForPreset("6months", "2024-08-31").startDate, "2024-02-29");
});

test("creates a bounded set of evenly distributed chart date labels", () => {
  const short = calculateStatistics([], "2024-02-28", "2024-03-01");
  const long = calculateStatistics([], "2023-01-01", "2024-01-01");
  assert.deepEqual(short.ticks, ["2024-02-28", "2024-02-29", "2024-03-01"]);
  assert.equal(long.ticks.length, 7);
  assert.equal(new Set(long.ticks).size, 7);
});
