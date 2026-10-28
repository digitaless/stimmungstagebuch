import test from "node:test";
import assert from "node:assert/strict";
import { createMoodReport, presentPdfReport } from "../src/pdf-report.js";
import { calculateStatistics } from "../src/statistics.js";
import { translations, localeByLanguage } from "../src/i18n.js";

function entry(date, mood, values = {}) {
  return {
    id: `entry-${date}`,
    date,
    mood,
    energy: null,
    tension: null,
    sleepQuality: null,
    notes: "PRIVATE_NOTE_SHOULD_NOT_APPEAR",
    medications: "PRIVATE_MEDICATION_SHOULD_NOT_APPEAR",
    createdAt: `${date}T12:00:00.000Z`,
    updatedAt: `${date}T12:00:00.000Z`,
    ...values,
  };
}

function createReport(entries, language = "de") {
  const statistics = calculateStatistics(entries, "2024-01-01", "2024-01-31");
  return createMoodReport(
    statistics,
    language,
    translations,
    localeByLanguage,
    new Date("2024-02-01T12:00:00"),
  );
}

test("creates a local A4 report with selected-period data and optional measures", () => {
  const report = createReport([
    entry("2024-01-01", 2, { energy: 1 }),
    entry("2024-01-02", 4, { tension: 5, sleepQuality: 3 }),
    entry("2024-01-05", 5),
  ]);
  const pdf = report.output();

  assert.equal(Math.round(report.internal.pageSize.getWidth()), 210);
  assert.equal(Math.round(report.internal.pageSize.getHeight()), 297);
  assert.equal(report.lastAutoTable.body.length, 3);
  assert.equal(report.lastAutoTable.columns.length, 5);
  assert.match(pdf, /^%PDF-/);
  assert.equal(report.lastAutoTable.body[0].cells["1"].text.join(" "), "2 / 5");
  assert.equal(report.lastAutoTable.body[0].cells["2"].text.join(" "), "1 / 5");
  assert.equal(report.lastAutoTable.body[0].cells["3"].text.join(" "), "Nicht erfasst");
  assert.equal(report.lastAutoTable.body[0].cells["4"].text.join(" "), "Nicht erfasst");
  assert.ok(!pdf.includes("PRIVATE_NOTE_SHOULD_NOT_APPEAR"));
  assert.ok(!pdf.includes("PRIVATE_MEDICATION_SHOULD_NOT_APPEAR"));
});

test("paginates long date ranges and rejects empty reports", () => {
  const entries = Array.from({ length: 180 }, (_, index) => {
    const date = new Date(Date.UTC(2024, 0, 1 + index)).toISOString().slice(0, 10);
    return entry(date, (index % 5) + 1, {
      energy: index % 2 ? null : (index % 5) + 1,
      tension: index % 3 ? null : (index % 5) + 1,
      sleepQuality: index % 4 ? null : (index % 5) + 1,
    });
  });
  const statistics = calculateStatistics(entries, "2024-01-01", "2024-06-28");
  const report = createMoodReport(statistics, "en", translations, localeByLanguage);

  assert.ok(report.internal.getNumberOfPages() > 2);
  assert.equal(report.lastAutoTable.body.length, 180);
  assert.throws(
    () => createReport([]),
    { code: "empty_period" },
  );
});

test("opens generated PDFs directly and downloads when a new tab is blocked", () => {
  const createdUrls = [];
  const revokedUrls = [];
  let clicked = false;
  const browser = {
    URL: {
      createObjectURL(blob) {
        assert.equal(blob.type, "application/pdf");
        const url = `blob:local/${createdUrls.length}`;
        createdUrls.push(url);
        return url;
      },
      revokeObjectURL(url) {
        revokedUrls.push(url);
      },
    },
    open() {
      return {
        location: { href: "" },
        opener: {},
      };
    },
    document: {
      body: {
        append() {},
      },
      createElement() {
        return {
          click() {
            clicked = true;
          },
          remove() {},
        };
      },
    },
    setTimeout(callback) {
      callback();
    },
  };
  const doc = { output: () => new Blob(["%PDF"], { type: "application/pdf" }) };
  assert.equal(presentPdfReport(doc, browser), "opened");
  assert.deepEqual(revokedUrls, [createdUrls[0]]);

  browser.open = () => null;
  assert.equal(presentPdfReport(doc, browser), "downloaded");
  assert.equal(clicked, true);
});
