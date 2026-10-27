import { isValidLocalDate } from "./storage.js";

const OPTIONAL_METRICS = ["energy", "tension", "sleepQuality"];
const DAY_MS = 24 * 60 * 60 * 1000;

function statisticsError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function dayNumber(date) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(0);
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCFullYear(year, month - 1, day);
  return Math.floor(value.getTime() / DAY_MS);
}

function dateFromDayNumber(number) {
  const date = new Date(number * DAY_MS);
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(
    date.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function subtractCalendarMonths(dateString, months) {
  if (!isValidLocalDate(dateString) || !Number.isInteger(months) || months < 0) {
    throw statisticsError("invalid_period");
  }
  const [year, month, day] = dateString.split("-").map(Number);
  const firstOfTargetMonth = new Date(0);
  firstOfTargetMonth.setHours(12, 0, 0, 0);
  firstOfTargetMonth.setFullYear(year, month - 1 - months, 1);
  const targetYear = firstOfTargetMonth.getFullYear();
  const targetMonth = firstOfTargetMonth.getMonth();
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const result = new Date(targetYear, targetMonth, Math.min(day, lastDay), 12);
  return localDateString(result);
}

export function validatePeriod(startDate, endDate) {
  if (!isValidLocalDate(startDate) || !isValidLocalDate(endDate)) {
    throw statisticsError("invalid_date");
  }
  if (startDate > endDate) throw statisticsError("invalid_period");
  return {
    startDate,
    endDate,
    dayCount: dayNumber(endDate) - dayNumber(startDate) + 1,
  };
}

export function getPeriodForPreset(preset, today) {
  if (!isValidLocalDate(today)) throw statisticsError("invalid_date");
  const daysByPreset = { "14": 14, "30": 30, "90": 90 };
  if (daysByPreset[preset]) {
    const end = dayNumber(today);
    return validatePeriod(
      dateFromDayNumber(end - daysByPreset[preset] + 1),
      today,
    );
  }
  if (preset === "6months" || preset === "12months") {
    return validatePeriod(
      subtractCalendarMonths(today, preset === "6months" ? 6 : 12),
      today,
    );
  }
  throw statisticsError("invalid_preset");
}

function validScale(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
}

export function calculateStatistics(entries, startDate, endDate) {
  const period = validatePeriod(startDate, endDate);
  if (!Array.isArray(entries)) throw statisticsError("invalid_entries");

  const selected = [];
  let invalidEntryCount = 0;
  entries.forEach((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      !isValidLocalDate(entry.date) ||
      validScale(entry.mood) === null
    ) {
      invalidEntryCount += 1;
      return;
    }
    if (entry.date < startDate || entry.date > endDate) return;
    const normalized = { date: entry.date, mood: entry.mood };
    OPTIONAL_METRICS.forEach((metric) => {
      normalized[metric] = validScale(entry[metric]);
    });
    selected.push(normalized);
  });
  selected.sort((a, b) => a.date.localeCompare(b.date));

  const moodValues = selected.map((entry) => entry.mood);
  const optional = Object.fromEntries(
    OPTIONAL_METRICS.map((metric) => {
      const values = selected
        .map((entry) => entry[metric])
        .filter((value) => value !== null);
      return [
        metric,
        {
          count: values.length,
          average: values.length
            ? values.reduce((sum, value) => sum + value, 0) / values.length
            : null,
        },
      ];
    }),
  );

  const ticks = Array.from({ length: Math.min(7, period.dayCount) }, (_, index) => {
    const tickDay =
      dayNumber(startDate) +
      Math.round((index * (period.dayCount - 1)) / (Math.min(7, period.dayCount) - 1 || 1));
    return dateFromDayNumber(tickDay);
  });

  return {
    ...period,
    entryCount: selected.length,
    daysWithEntry: selected.length,
    averageMood: moodValues.length
      ? moodValues.reduce((sum, value) => sum + value, 0) / moodValues.length
      : null,
    highestMood: moodValues.length ? Math.max(...moodValues) : null,
    lowestMood: moodValues.length ? Math.min(...moodValues) : null,
    entries: selected,
    optional,
    ticks,
    invalidEntryCount,
  };
}

export function getConsecutiveSegments(entries, metric) {
  const points = entries
    .map((entry) => ({ date: entry.date, value: validScale(entry[metric]) }))
    .filter((point) => point.value !== null);
  const segments = [];
  let previous = null;
  points.forEach((point) => {
    if (previous && dayNumber(point.date) - dayNumber(previous.date) === 1) {
      const currentSegment = segments[segments.length - 1];
      if (currentSegment.at(-1) === previous) currentSegment.push(point);
      else segments.push([previous, point]);
    } else {
      segments.push([point]);
    }
    previous = point;
  });
  return segments;
}
